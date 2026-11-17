use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Instant, SystemTime, UNIX_EPOCH},
};

#[derive(Clone)]
struct AppState {
    db: Arc<Mutex<Connection>>,
    started: Instant,
}

#[derive(Serialize)]
struct PingResponse {
    status: &'static str,
    runtime: &'static str,
    uptime_ms: u128,
}

#[derive(Deserialize)]
struct RecordRequest {
    user_id: String,
    action: String,
}

#[derive(Serialize)]
struct RecordResponse {
    status: &'static str,
    total_rows: i64,
}

async fn ping(State(state): State<AppState>) -> Json<PingResponse> {
    Json(PingResponse {
        status: "ok",
        runtime: "rust",
        uptime_ms: state.started.elapsed().as_millis(),
    })
}

async fn record(
    State(state): State<AppState>,
    Json(body): Json<RecordRequest>,
) -> Result<Json<RecordResponse>, (StatusCode, String)> {
    if body.user_id.is_empty() || body.action.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "user_id and action must be non-empty".to_string(),
        ));
    }

    let db = Arc::clone(&state.db);
    let total_rows = tokio::task::spawn_blocking(move || -> Result<i64, String> {
        let connection = db
            .lock()
            .map_err(|_| "database mutex poisoned".to_string())?;
        let created_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        connection
            .execute(
                "INSERT INTO access_logs (user_id, action, created_at) VALUES (?1, ?2, ?3)",
                params![body.user_id, body.action, created_at],
            )
            .map_err(|error| error.to_string())?;
        connection
            .query_row("SELECT COUNT(*) FROM access_logs", [], |row| row.get(0))
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?
    .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error))?;

    Ok(Json(RecordResponse {
        status: "recorded",
        total_rows,
    }))
}

fn database_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join("data/bench.db")
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db_path = database_path();
    let data_dir = db_path.parent().expect("database path has a parent");
    std::fs::create_dir_all(data_dir)?;

    let connection = Connection::open(&db_path)?;
    connection.busy_timeout(std::time::Duration::from_secs(30))?;
    connection.execute_batch(
        "PRAGMA journal_mode = DELETE;
         PRAGMA synchronous = FULL;
         CREATE TABLE IF NOT EXISTS access_logs (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             user_id TEXT NOT NULL,
             action TEXT NOT NULL,
             created_at INTEGER NOT NULL
         );",
    )?;

    let state = AppState {
        db: Arc::new(Mutex::new(connection)),
        started: Instant::now(),
    };
    let app = Router::new()
        .route("/api/ping", get(ping))
        .route("/api/record", post(record))
        .with_state(state);

    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "3000".to_string())
        .parse()?;
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await?;
    println!(
        "Rust server listening on 0.0.0.0:{port}; SQLite: {}",
        db_path.display()
    );
    axum::serve(listener, app).await?;
    Ok(())
}
