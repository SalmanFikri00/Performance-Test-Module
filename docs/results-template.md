# Template Pencatatan Hasil Benchmark

Salin file ini untuk setiap sesi benchmark. Isi sebelum membandingkan hasil agar kondisi pengujian dapat diulang.

## Identitas sesi

- Tanggal dan waktu:
- Operator:
- Commit/source version:
- Tujuan pengujian:

## Kondisi perangkat dan jaringan

- Board dan varian RAM Orange Pi Zero 3:
- OS, versi, dan kernel:
- Node.js:
- Rust:
- k6:
- MicroSD (merek, model, kapasitas, filesystem):
- Catu daya dan pendinginan:
- Suhu awal/akhir atau indikasi throttling:
- Koneksi laptop–Orange Pi (Ethernet/Wi-Fi, band, kondisi jaringan):
- Aktivitas lain pada laptop/perangkat:
- Port:
- Profil k6 (default: 300 VU/15s, lalu 1.000 VU/15s):

## Catatan hasil per tahap

Isi nilai terpisah untuk setiap runtime, ronde, dan tahap. Jangan gabungkan `warmup` dan `peak` menjadi satu angka.

| Runtime | Ronde | Tahap/VU | Durasi | Request | RPS | Avg latency | Median | p90 | p95 | Max | Check/error | Peak CPU | Peak RAM | MicroSD %util | File `.txt` / `.json` | Catatan |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---|---|
| Node | 1 — ping | warmup / 300 | 15s | | | | | | | | | | | | | |
| Node | 1 — ping | peak / 1.000 | 15s | | | | | | | | | | | | | |
| Node | 2 — SQLite | warmup / 300 | 15s | | | | | | | | | | | | | |
| Node | 2 — SQLite | peak / 1.000 | 15s | | | | | | | | | | | | | |
| Rust | 1 — ping | warmup / 300 | 15s | | | | | | | | | | | | | |
| Rust | 1 — ping | peak / 1.000 | 15s | | | | | | | | | | | | | |
| Rust | 2 — SQLite | warmup / 300 | 15s | | | | | | | | | | | | | |
| Rust | 2 — SQLite | peak / 1.000 | 15s | | | | | | | | | | | | | |

## State database Ronde 2

- Node: jumlah baris sebelum run / sesudah warmup / sesudah peak:
- Rust: jumlah baris sebelum run / sesudah warmup / sesudah peak:
- Konfirmasi database direset saat server berhenti sebelum setiap runtime:

Baris terus bertambah selama Ronde 2; tahap puncak mengikuti state setelah warmup. Catat perbedaan jumlah baris dan hindari menyatakan bahwa state database pada tahap puncak identik.

## Kesimpulan singkat

- Hasil utama:
- Keterbatasan atau anomali:
- Apakah laptop atau jaringan tampak menjadi bottleneck:
- Apakah run perlu diulang:
