# Orange Pi Zero 3 Performance Test Module

Modul ini membandingkan dua implementasi HTTP pada **Orange Pi Zero 3 bare-metal**: Node.js dengan Fastify dan `better-sqlite3`, serta Rust dengan Axum dan `rusqlite`. Beban dibuat dari laptop menggunakan k6 melalui LAN; Orange Pi hanya menjalankan satu server pada satu waktu.

Panduan ini mempertahankan dua ronde uji yang sederhana. Setiap ronde menjalankan dua tahap beban berurutan: pemanasan pada **300 VU selama 15 detik**, lalu puncak pada **1.000 VU selama 15 detik**.

## Cakupan benchmark

| Ronde | Request | Yang diukur |
|---|---|---|
| 1 — API tanpa database | `GET /api/ping` | HTTP, runtime aplikasi, dan jaringan tanpa membaca/menulis SQLite |
| 2 — SQLite | `POST /api/record` | Parsing request, satu `INSERT`, `synchronous=FULL`, dan `SELECT COUNT(*)` |

Kedua server menggunakan `0.0.0.0:3000`, database `data/bench.db`, serta pragma SQLite `journal_mode=DELETE` dan `synchronous=FULL`. Payload dan endpoint sama. Jangan menjalankan kedua server bersamaan.

## Yang dibutuhkan

**Di Orange Pi Zero 3:** Debian/Armbian 64-bit, koneksi LAN yang sama dengan laptop, Node.js 22+, Rust stable, serta compiler dan utilitas monitoring. Disarankan memakai catu daya dan pendinginan yang stabil.

**Di laptop:** k6, `curl`, dan salinan repo. Gunakan koneksi LAN/Wi-Fi yang stabil dan jangan menjalankan beban lain selama benchmark.

## 1. Siapkan Orange Pi

Pasang kebutuhan build dan monitoring:

```bash
sudo apt update
sudo apt install -y build-essential pkg-config tmux htop sysstat curl python3
```

Pasang Node.js 22 dan Rust stable:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
```

Pastikan tersedia `node --version`, `npm --version`, dan `cargo --version`.

## 2. Ambil source dan build di Orange Pi

Build langsung di Orange Pi agar modul Node dan executable Rust sesuai arsitektur ARM64 perangkat:

```bash
git clone https://github.com/SalmanFikri00/Performance-Test-Module.git
cd Performance-Test-Module
(cd apps/server-node && npm ci)
cargo build --manifest-path apps/server-rust/Cargo.toml --release --locked
```

Build Rust pertama kali dapat memerlukan waktu. Biarkan perangkat mendapat daya yang stabil dan tunggu sampai perintah selesai sebelum menjalankan server.

## 3. Jalankan monitoring dan satu server

Dari root repo di Orange Pi, buka panel tiga-pane:

```bash
./scripts/studio.sh
```

Pane kiri adalah terminal kontrol, sementara pane kanan menampilkan `htop` dan `iostat -xz 1`. Di pane kiri, jalankan **satu** server.

Untuk Node.js:

```bash
cd apps/server-node && npm start
```

Untuk Rust, hentikan server Node terlebih dahulu dengan `Ctrl+C`, kembali ke root repo, lalu jalankan:

```bash
cd /path/to/Performance-Test-Module
./apps/server-rust/target/release/server-rust
```

Kedua server secara default memakai port `3000`; variabel `PORT` dapat mengubah port. Cari alamat perangkat dari terminal Orange Pi:

```bash
hostname -I
```

Dari laptop, pemeriksaan ping berikut memastikan server dapat dijangkau. Ganti alamat dengan IP Orange Pi:

```bash
curl --fail http://192.168.1.50:3000/api/ping
```

Respons normal berisi `status: "ok"` dan `runtime: "node"` atau `"rust"`.

## 4. Siapkan k6 di laptop

Pilih instruksi sesuai sistem operasi.

macOS dengan Homebrew:

```bash
brew install k6
```

Ubuntu atau WSL2 Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates gnupg curl
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://dl.k6.io/key.gpg | sudo gpg --dearmor --yes -o /etc/apt/keyrings/k6.gpg
echo "deb [signed-by=/etc/apt/keyrings/k6.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install -y k6
```

Cek instalasi dan konektivitas:

```bash
k6 version
curl --fail http://192.168.1.50:3000/api/ping
```

Windows dapat menjalankan langkah ini dari WSL2 Ubuntu. Pastikan WSL2 dapat mengakses IP Orange Pi melalui jaringan lokal.

## 5. Jalankan dua ronde dari laptop

Dari root repo di laptop, gunakan alamat IP atau hostname **tanpa** `http://` dan tanpa path:

```bash
# Ronde 1: GET /api/ping
./scripts/bench.sh 192.168.1.50 round1

# Ronde 2: POST /api/record
./scripts/bench.sh 192.168.1.50 round2
```

Setiap perintah menjalankan dua tahap: `warmup` pada 300 VU, kemudian `peak` pada 1.000 VU. Durasi setiap tahap default 15 detik. Untuk mengubah concurrency puncak dan durasi kedua tahap, berikan argumen ketiga dan keempat:

```bash
./scripts/bench.sh 192.168.1.50 round1 500 10s
```

Tahap pemanasan tetap 300 VU. Gunakan parameter identik ketika membandingkan Node dan Rust, lalu tuliskan perubahan parameter pada catatan hasil.

Sebelum tiap tahap k6, skrip mengirim satu `GET /api/ping` untuk preflight dan mendeteksi runtime aktif. Request preflight itu tidak masuk ke metrik k6. Hasil setiap tahap tersimpan di `results/` sebagai file `.txt` (output k6) dan `.json` (summary k6); nama file memuat timestamp, ronde, runtime, tahap, dan VU. File hasil lokal sengaja tidak ikut Git.

## 6. Bandingkan Node dan Rust secara konsisten

Urutan berikut menghasilkan database awal yang kosong untuk setiap runtime. Ronde 1 tidak mengubah database, sehingga satu database bersih dapat digunakan untuk ronde 1 dan ronde 2 pada runtime yang sama.

1. Hentikan proses server lama. Dari root repo di Orange Pi, reset database ketika tidak ada server yang sedang berjalan:

   ```bash
   rm -f data/bench.db data/bench.db-*
   ```

2. Jalankan server Node. Dari laptop, jalankan `round1`, lalu `round2` dengan parameter yang sama.
3. Hentikan Node dengan `Ctrl+C`. Reset database menggunakan perintah yang sama, lalu jalankan server Rust.
4. Dari laptop, jalankan `round1`, lalu `round2` dengan parameter yang sama.
5. Catat kondisi perangkat, jaringan, hasil kedua tahap, dan metrik monitoring pada [template pencatatan hasil](docs/results-template.md).

**Catatan penting untuk Ronde 2:** tabel `access_logs` bertambah selama tahap pemanasan dan tidak direset di antara tahap pemanasan dan puncak. Karena `SELECT COUNT(*)` dilakukan pada setiap request, tahap puncak merupakan kelanjutan dari keadaan database setelah pemanasan; jumlah baris akhirnya dapat berbeda antara Node dan Rust. Laporkan hasil sebagai satu rangkaian dua tahap dan jangan menyebut state database tahap puncak identik. Reset database di antara runtime tetap wajib.

## Smoke test opsional

Untuk memeriksa kedua endpoint dan format respons sebelum pengukuran, jalankan dari laptop:

```bash
./scripts/smoke.sh http://192.168.1.50:3000
```

Smoke test menulis satu baris ke SQLite. Untuk pengukuran dengan database awal kosong, hentikan server sesudah smoke test, hapus `data/bench.db` dan file journal seperti langkah di atas, lalu mulai ulang server sebelum benchmark.

## Membaca dan melaporkan hasil

Baca output `.txt` dan summary `.json` untuk **masing-masing** tahap. Perhatikan throughput aktual, `http_req_duration` (avg, median, p90, p95, max), jumlah request, serta check dan error. Skrip menandai kegagalan stage bila ada check respons yang gagal; tahap berikutnya tetap dijalankan agar seluruh profil tercatat.

VU adalah virtual user yang mengulang request setelah respons selesai—bukan jaminan jumlah request per detik. RPS adalah throughput yang tercapai, bukan angka yang dikonfigurasi. Ronde 2 juga mencakup antrean database, penulisan/journal SQLite, dan pemindaian `COUNT(*)`; jangan menafsirkan hasilnya sebagai kecepatan `INSERT` saja.

Saat setiap tahap berjalan, catat CPU/RAM pada `htop` dan `%util` device MicroSD yang benar dari `iostat`. `%util` bukan ukuran latency disk. Gunakan template hasil untuk mencatat model MicroSD, OS/kernel, versi Node/Rust/k6, suhu/throttling, catu daya, kondisi jaringan, nilai awal/akhir database, serta file hasil k6.

## Troubleshooting singkat

- **Preflight gagal:** pastikan hanya satu server aktif, IP/port benar, perangkat dan laptop berada di LAN yang sama, dan firewall mengizinkan koneksi.
- **`k6` tidak ditemukan:** instal k6 di laptop, bukan Orange Pi.
- **Build `better-sqlite3` gagal:** periksa Node.js 22+ dan paket `build-essential`/`python3` di Orange Pi.
- **R2 melambat atau gagal di tahap puncak:** lihat error/check rate dan latency p95/max bersama CPU, RAM, suhu, dan iostat; jangan hanya melihat RPS.
- **Hasil Node/Rust tidak sebanding:** pastikan commit, parameter, kondisi jaringan, state awal database per runtime, daya, pendinginan, dan beban latar sama.

Hasil akhir yang representatif harus diambil di Orange Pi Zero 3 fisik. Benchmark di mesin lain hanya menguji alur tool, bukan performa perangkat target.
