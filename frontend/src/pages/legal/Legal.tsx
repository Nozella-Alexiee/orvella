/* Kebijakan Privasi (/privasi) dan Syarat Penggunaan (/syarat). DRAF: bagian dalam [kurung siku] wajib diisi pengelola
   sebelum app dipublikasikan, dan isinya sebaiknya dicek orang yang paham hukum. */
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import '../public/public.css';
import { Icon } from '../../design/Icon';
import { PublicShell } from '../public/Public';

const UPDATED = '1 Oktober 2026';
const Fill = ({ children }: { children: ReactNode }) => <mark className="legal-fill">[{children}]</mark>;

function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <PublicShell nav={<><Link className="os-mb-item" to="/privasi">Privasi</Link><Link className="os-mb-item" to="/syarat">Syarat</Link></>}>
      <main className="legal-wrap">
        <article className="legal">
          <div className="legal-draft"><Icon name="circle-alert" size={14} />Draf: bagian bertanda [kurung siku] belum diisi. Cek dulu sebelum Orvella dipublikasikan.</div>
          <h1>{title}</h1>
          <p className="legal-meta">Terakhir diperbarui {UPDATED}</p>
          {children}
          <p className="legal-meta"><Link className="link" to="/privasi">Kebijakan Privasi</Link> · <Link className="link" to="/syarat">Syarat Penggunaan</Link> · <Link className="link" to="/">Beranda Orvella</Link></p>
        </article>
      </main>
    </PublicShell>
  );
}

export function Privasi() {
  return (
    <LegalPage title="Kebijakan Privasi">
      <p>Orvella adalah aplikasi belajar ngoding open source yang dikelola oleh <Fill>nama pengelola</Fill>. Halaman ini menjelaskan data apa yang kami simpan, buat apa, dan apa hakmu. Pertanyaan soal privasi bisa dikirim ke <Fill>email kontak</Fill>.</p>

      <h2>1. Data yang kami simpan</h2>
      <ul>
        <li><b>Akun:</b> nama panggilan dan email. Kata sandi disimpan sebagai hash (bcrypt), bukan teks aslinya. Kalau masuk lewat Google, kami menerima nama, email, dan ID akun Google-mu.</li>
        <li><b>Belajar:</b> progres bab, jawaban latihan dan kuis, XP, beruntun, dan lencana.</li>
        <li><b>Proyek:</b> kode dan berkas di Sandbox, snapshot, dan rekaman replay ketikan.</li>
        <li><b>Sosial:</b> teman, sorakan, komentar, obrolan saat ngoding bareng, dan proyek yang kamu terbitkan di Galeri.</li>
        <li><b>Keamanan:</b> alamat IP dan email saat ada percobaan masuk yang gagal atau permintaan lupa kata sandi. Disimpan paling lama 1 hari. Perubahan oleh admin dicatat di log aktivitas.</li>
      </ul>

      <h2>2. Untuk apa</h2>
      <ul>
        <li>Menjalankan Orvella dan menyimpan progresmu.</li>
        <li>Menjaga akun tetap aman, misalnya membatasi percobaan tebak kata sandi.</li>
        <li>Mengirim email atur ulang kata sandi kalau kamu memintanya.</li>
        <li>Memperbaiki materi belajar dari statistik gabungan tanpa nama, misalnya soal mana yang paling sering salah.</li>
      </ul>
      <p>Kami <b>tidak menjual</b> data pribadimu dan tidak memasang iklan.</p>

      <h2>3. Layanan pihak ketiga</h2>
      <ul>
        <li><b>Google:</b> untuk Masuk dengan Google.</li>
        <li><b>Spotify dan Apple Music:</b> pemutar resmi mereka. Kamu masuk langsung di pemutarnya, dan Orvella tidak melihat akunmu. Kalau kamu menyambungkan akun Spotify secara penuh, Orvella cuma membaca hal yang kamu setujui di layar izin Spotify.</li>
        <li><b>Layanan AI (Groq, Cerebras, Google Gemini)</b> untuk Orvi AI: yang dikirim cuma obrolanmu dengan Orvi, pesan error, dan isi berkas proyek Sandbox yang sedang terhubung ke Orvi. Kalau Orvi mencari di internet, kata kuncinya dikirim server Orvella ke mesin pencari (lewat SearXNG) dan halaman dibuka oleh server, jadi situs yang dibuka tidak melihat alamat IP atau akunmu. Tanpa nama, email, atau ID akun. Kalau kamu memakai kunci AI sendiri, pertanyaanmu juga tunduk pada kebijakan layanan itu.</li>
        <li><b>Email:</b> <Fill>nama layanan email</Fill> untuk mengirim link atur ulang kata sandi.</li>
        <li><b>Hosting:</b> <Fill>nama penyedia hosting dan lokasi server</Fill>.</li>
      </ul>

      <h2>4. Cookie dan penyimpanan di browser</h2>
      <p>Kami cuma memakai cookie sesi supaya kamu tetap masuk, plus cookie sementara selama proses Masuk dengan Google. Tidak ada cookie iklan atau pelacak. Pilihan tampilan (tema, wallpaper, animasi) disimpan di browsermu sendiri.</p>

      <h2>5. Berapa lama disimpan</h2>
      <p>Data akun, belajar, dan proyek disimpan selama akunmu aktif. Kalau kamu menghapus akun (Pengaturan › Privasi › Hapus akun), progres dan proyekmu dihapus permanen. Proyek yang sudah di-remix orang lain tetap ada di salinan mereka. Log aktivitas admin disimpan <Fill>berapa lama</Fill>.</p>

      <h2>6. Hakmu</h2>
      <p>Sesuai Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi, kamu berhak melihat, memperbaiki, dan menghapus data pribadimu, menarik persetujuan, dan mengajukan keberatan. Sebagian bisa langsung dilakukan di Pengaturan. Untuk yang lain, hubungi <Fill>email kontak</Fill>.</p>

      <h2>7. Pengguna di bawah umur</h2>
      <p>Banyak pengguna Orvella masih pelajar. Kalau kamu belum dewasa menurut hukum yang berlaku, minta izin orang tua atau wali sebelum membuat akun. Orang tua atau wali boleh meminta kami menghapus akun anaknya lewat <Fill>email kontak</Fill>.</p>

      <h2>8. Keamanan</h2>
      <p>Kata sandi di-hash, percobaan masuk dibatasi, dan sesi lama otomatis keluar saat kata sandi diganti. Tidak ada sistem yang 100% aman. Kalau kamu menemukan celah keamanan, kabari kami di <Fill>email kontak</Fill>.</p>

      <h2>9. Perubahan</h2>
      <p>Kalau kebijakan ini berubah, tanggal di atas ikut diperbarui. Perubahan penting akan kami umumkan di aplikasi.</p>
    </LegalPage>
  );
}

export function Syarat() {
  return (
    <LegalPage title="Syarat Penggunaan">
      <p>Dengan memakai Orvella, kamu setuju dengan syarat di bawah. Orvella dikelola oleh <Fill>nama pengelola</Fill>. Kontak: <Fill>email kontak</Fill>.</p>

      <h2>1. Akun</h2>
      <ul>
        <li>Satu akun untuk satu orang. Jaga kata sandimu dan jangan bagikan akunmu.</li>
        <li>Isi data dengan benar. Kalau kamu belum dewasa, pakai Orvella dengan izin orang tua atau wali.</li>
      </ul>

      <h2>2. Pakai dengan wajar</h2>
      <p>Kamu tidak boleh:</p>
      <ul>
        <li>Mencoba membobol, membebani, atau mengganggu Orvella dan pengguna lain.</li>
        <li>Menjalankan kode berbahaya di Sandbox, misalnya malware, menambang kripto, atau menyerang situs lain.</li>
        <li>Mengirim spam, konten yang melanggar hukum, atau melecehkan orang lain lewat komentar, obrolan, atau proyek.</li>
        <li>Memakai Orvi AI atau fitur lain secara otomatis (bot) untuk menghabiskan jatah bersama.</li>
      </ul>

      <h2>3. Proyek dan kontenmu</h2>
      <p>Kode dan proyek yang kamu buat tetap milikmu. Kalau kamu menerbitkannya ke Galeri, kamu mengizinkan pengguna lain melihat, mencoba, dan me-remix proyek itu sesuai pilihan yang kamu atur saat menerbitkan. Jangan menerbitkan karya orang lain tanpa izin.</p>

      <h2>4. Orvi AI</h2>
      <p>Orvi AI punya batas pemakaian yang bisa berubah. Jawabannya bisa keliru, jadi cek lagi sebelum dipakai. Jangan menaruh kata sandi, kunci API, atau data pribadi di kode yang kamu tanyakan.</p>

      <h2>5. Batas sumber daya</h2>
      <p>Sandbox, pratinjau web, dan fitur lain punya batas waktu, memori, dan penyimpanan supaya Orvella tetap lancar buat semua orang. Proyek yang lama tidak dipakai bisa ditidurkan.</p>

      <h2>6. Kode Orvella</h2>
      <p>Orvella adalah perangkat lunak open source dengan lisensi <Fill>nama lisensi</Fill>. Syarat ini berlaku untuk layanan Orvella yang kami jalankan, bukan untuk salinan yang dijalankan orang lain.</p>

      <h2>7. Penangguhan</h2>
      <p>Kami boleh membatasi atau menangguhkan akun yang melanggar syarat ini, setelah sebisa mungkin memberi tahu alasannya. Kamu bisa menghapus akunmu kapan saja di Pengaturan.</p>

      <h2>8. Tanpa jaminan</h2>
      <p>Orvella disediakan apa adanya. Kami berusaha menjaganya tetap jalan dan aman, tapi tidak menjamin layanan selalu tersedia atau bebas kesalahan.</p>

      <h2>9. Perubahan dan hukum yang berlaku</h2>
      <p>Syarat ini bisa diperbarui, dan tanggal di atas ikut berubah. Syarat ini tunduk pada hukum Republik Indonesia.</p>
    </LegalPage>
  );
}
