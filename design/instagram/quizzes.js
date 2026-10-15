/* Seri "Tebak output-nya?" untuk IG. Tambah kuis baru di sini, lalu: node design/instagram/render.mjs quiz
   code: baris kode apa adanya (disorot sederhana di quiz.html) · answer: indeks pilihan yang benar
   mem: kotak memori di slide jawaban: [nama, nilai, catatan?] sebelum → sesudah */
window.QUIZZES = {
  py: {
    no: 1, lang: 'Python', color: '#3470C9', mono: 'Py',
    code: ['x = 4', 'x = x * 2', 'print(x)'],
    options: ['4', '8', 'x * 2'], answer: 1,
    explain: 'Komputer menghitung kanan dulu: 4 × 2 = 8. Hasilnya disimpan lagi ke x.',
    mem: { before: [['x', '4']], after: [['x', '8', 'ditimpa']] },
    caption: 'Tebak dulu sebelum geser! x = x * 2 itu bukan persamaan matematika, tapi perintah.',
  },
  js: {
    no: 2, lang: 'JavaScript', color: '#EDC21B', mono: 'JS', ink: '#2A2100',
    code: ['let a = "2";', 'let b = 2;', 'console.log(a + b);'],
    options: ['4', '22', 'NaN'], answer: 1,
    explain: 'Kalau salah satunya teks, + menyambung teks. "2" + 2 jadi "22".',
    mem: { before: [['a', '"2"', 'teks'], ['b', '2', 'angka']], after: [['a + b', '"22"', 'teks']] },
    caption: 'Tanda + di JavaScript punya dua pekerjaan. Yang mana yang dipakai di sini?',
  },
  cpp: {
    no: 3, lang: 'C++', color: '#3353C3', mono: 'C++',
    code: ['int a = 7;', 'int b = 2;', 'cout << a / b;'],
    options: ['3.5', '3', '4'], answer: 1,
    explain: 'int dibagi int hasilnya int juga. Bagian desimalnya dibuang, bukan dibulatkan.',
    mem: { before: [['a', '7', 'int'], ['b', '2', 'int']], after: [['a / b', '3', 'int']] },
    caption: 'Pembagian di C++ kadang bikin kaget. Berapa hasilnya?',
  },
};
