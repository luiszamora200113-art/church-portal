// Lista corta de versículos para mostrar uno distinto cada día en el dashboard.
// Rota automáticamente según el día del año — sin necesidad de backend ni configuración.
const VERSES = [
  { text: 'Todo lo puedo en Cristo que me fortalece.', ref: 'Filipenses 4:13' },
  { text: 'El Señor es mi pastor, nada me faltará.', ref: 'Salmos 23:1' },
  { text: 'Encomienda a Jehová tu camino, y confía en él; y él hará.', ref: 'Salmos 37:5' },
  { text: 'Porque yo sé los pensamientos que tengo acerca de vosotros, dice Jehová, pensamientos de paz.', ref: 'Jeremías 29:11' },
  { text: 'No te dejaré, ni te desampararé.', ref: 'Josué 1:5' },
  { text: 'Todo lo que pidiereis en oración, creyendo, lo recibiréis.', ref: 'Mateo 21:22' },
  { text: 'Fiel es Dios, que no os dejará ser tentados más de lo que podéis resistir.', ref: '1 Corintios 10:13' },
  { text: 'El gozo de Jehová es vuestra fuerza.', ref: 'Nehemías 8:10' },
  { text: 'Amados, amémonos unos a otros; porque el amor es de Dios.', ref: '1 Juan 4:7' },
  { text: 'Jehová peleará por vosotros, y vosotros estaréis tranquilos.', ref: 'Éxodo 14:14' },
  { text: 'No temas, porque yo estoy contigo; no desmayes, porque yo soy tu Dios.', ref: 'Isaías 41:10' },
  { text: 'Buscad primeramente el reino de Dios y su justicia.', ref: 'Mateo 6:33' },
  { text: 'La alegría de Jehová es vuestra fuerza.', ref: 'Nehemías 8:10' },
  { text: 'Del Señor es la tierra y su plenitud.', ref: 'Salmos 24:1' },
  { text: 'Confía en Jehová de todo tu corazón, y no te apoyes en tu propia prudencia.', ref: 'Proverbios 3:5' },
];

export function verseOfTheDay() {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000
  );
  return VERSES[dayOfYear % VERSES.length];
}
