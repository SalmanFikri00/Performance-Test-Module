# PRD: Orange Pi Zero 3 Stress Benchmark (`opi-stress-bench`)

## 1. Ringkasan Proyek
* **Nama Repository:** `opi-stress-bench`
* **Tujuan Teknis:** Mengukur batas performa perangkat keras **Orange Pi Zero 3** (ARM64, MicroSD storage) dalam menangani ribuan *concurrent users* secara lokal tanpa internet, serta mengisolasi *bottleneck* antara komputasi (CPU/RAM) dan penyimpanan (*Disk I/O*).
* **Tujuan Konten (`@msf.dev`):** Menghasilkan bukti eksperimen yang visual, kontras, dan terukur untuk **Content 3** melalui dua ronde pengujian bertahap.

---

## 2. Spesifikasi Environment & Arsitektur
* **Target Hardware:** Orange Pi Zero 3 (Allwinner H618, daya USB Type-C, storage MicroSD).
* **Metode Eksekusi:** **Bare-metal foreground** di dalam sesi `tmux` (tanpa Docker maupun `systemd`) untuk memastikan 0% *overhead* daemon/virtual network dan mempermudah pergantian ronde saat syuting.
* **Client Load Generator:** Laptop di jaringan lokal yang sama (LAN / Wi-Fi 5GHz) menggunakan k6; generator hanya berjalan di laptop.

### Parity Rules (Keadilan Perbandingan)
| Komponen | Node.js | Rust | Catatan |
| :--- | :--- | :--- | :--- |
| **HTTP Framework** | Fastify v5 | Axum (Tokio) | Framework ringan berperforma tinggi |
| **SQLite Driver** | `better-sqlite3` | `rusqlite` (`bundled`) | Eksekusi raw SQL tanpa ORM |
| **Port** | `0.0.0.0:3000` | `0.0.0.0:3000` | Hanya 1 runtime yang aktif per sesi tes |
| **SQLite Pragmas** | `journal_mode = DELETE`<br>`synchronous = FULL` | `journal_mode = DELETE`<br>`synchronous = FULL` | Sengaja memakai mode default (non-WAL) agar *bottleneck* I/O MicroSD terlihat jelas |

---

## 3. Struktur Repository
```text
opi-stress-bench/
├── apps/
│   ├── server-node/          # Fastify + better-sqlite3
│   │   ├── package.json
│   │   └── src/index.js
│   └── server-rust/          # Axum + rusqlite
│       ├── Cargo.toml
│       └── src/main.rs
├── scripts/
│   ├── studio.sh             # Layout 3-pane tmux (Server + htop + iostat)
│   ├── bench.sh              # Menjalankan tahap pemanasan dan puncak dengan k6
│   └── bench.js               # Request k6 untuk dua ronde API
├── data/                     # File bench.db (di-gitignore)
├── PRD.md
└── README.md
```

---

## 4. Kontrak API & Skema Database

### Skema SQLite (`data/bench.db`)
```sql
CREATE TABLE IF NOT EXISTS access_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
```

### Endpoint Pengujian
1. **Ronde 1 — Fetch API (Compute & Network I/O Only)**
   * **Method & Path:** `GET /api/ping`
   * **Behavior:** Mengembalikan response JSON langsung dari memori tanpa menyentuh disk.
   * **Response (`200 OK`):**
     ```json
     { "status": "ok", "runtime": "node|rust", "uptime_ms": 1200 }
     ```

2. **Ronde 2 — Read/Write Database (Disk I/O Intensif)**
   * **Method & Path:** `POST /api/record`
   * **Request Body:**
     ```json
     { "user_id": "usr_bench", "action": "checkin" }
     ```
   * **Behavior:** Menjalankan `INSERT` ke tabel `access_logs` lalu langsung membaca `SELECT COUNT(*)` dari MicroSD.
   * **Response (`200 OK`):**
     ```json
     { "status": "recorded", "total_rows": 15420 }
     ```

---

## 5. Skenario Pengujian & Metrik

### Skenario Beban (k6)
* **Tahap Pemanasan:** `300 concurrent users` selama `15 detik`.
* **Tahap Puncak (Stress Test):** `1.000 concurrent users` selama `15 detik`.
* Secara default, skrip laptop menjalankan dua tahap tersebut berurutan untuk tiap ronde API.

### Matriks Pengujian & Hasil
| Skenario | Runtime | Throughput (RPS) | Avg Latency (ms) | Peak CPU (%) | Peak RAM (MB) | MicroSD `%util` |
|---|---|---:|---:|---:|---:|---:|
| **Ronde 1:** `GET /api/ping` | Node.js | - | - | - | - | - |
| **Ronde 1:** `GET /api/ping` | Rust | - | - | - | - | - |
| **Ronde 2:** `POST /api/record` | Node.js | - | - | - | - | - |
| **Ronde 2:** `POST /api/record` | Rust | - | - | - | - | - |

---

## 6. Alur Eksekusi Singkat
1. **Persiapan Monitoring di Orange Pi:** Jalankan `./scripts/studio.sh` untuk membuka `tmux` berisi terminal kontrol, `htop`, dan `iostat -xz 1`.
2. **Sesi Node.js:** Jalankan `npm start` di `apps/server-node`, lalu jalankan `./scripts/bench.sh <IP_OPI> round1` dan `./scripts/bench.sh <IP_OPI> round2` dari laptop.
3. **Reset & Sesi Rust:** Hentikan proses Node (`Ctrl+C`), hapus database (`rm -f data/bench.db*`), jalankan binary Rust, lalu ulangi kedua ronde dari laptop. Gunakan concurrency dan durasi yang sama untuk kedua runtime.
