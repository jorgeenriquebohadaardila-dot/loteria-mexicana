const { CARDS } = require('./cards');

// Fisher-Yates shuffle
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Genera un tablero de 4×4 (16 IDs únicos de entre 54)
function generateBoard() {
  return shuffle(CARDS).slice(0, 16).map(c => c.id);
}

// Baraja completa mezclada (54 IDs)
function shuffleDeck() {
  return shuffle(CARDS.map(c => c.id));
}

// Patrones ganadores para tablero 4×4 (índices 0-15)
const WIN_PATTERNS = {
  row1:    [0, 1, 2, 3],
  row2:    [4, 5, 6, 7],
  row3:    [8, 9, 10, 11],
  row4:    [12, 13, 14, 15],
  col1:    [0, 4, 8, 12],
  col2:    [1, 5, 9, 13],
  col3:    [2, 6, 10, 14],
  col4:    [3, 7, 11, 15],
  diag1:   [0, 5, 10, 15],
  diag2:   [3, 6, 9, 12],
  corners: [0, 3, 12, 15],
  loteria: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]
};

const PATTERN_NAMES_ES = {
  row1:    'Primera fila',
  row2:    'Segunda fila',
  row3:    'Tercera fila',
  row4:    'Cuarta fila',
  col1:    'Primera columna',
  col2:    'Segunda columna',
  col3:    'Tercera columna',
  col4:    'Cuarta columna',
  diag1:   'Diagonal principal',
  diag2:   'Diagonal secundaria',
  corners: 'Cuatro esquinas',
  loteria: '¡LOTERÍA COMPLETA!'
};

// Devuelve el nombre del patrón ganador o null
function checkWin(board, markedCardIds) {
  const marked = new Set(markedCardIds);
  for (const [key, indices] of Object.entries(WIN_PATTERNS)) {
    if (indices.every(i => marked.has(board[i]))) return key;
  }
  return null;
}

// Valida que las marcas correspondan a cartas realmente cantadas
function validateWin(board, markedCardIds, drawnCardIds) {
  const drawnSet  = new Set(drawnCardIds);
  const boardSet  = new Set(board);

  // Todas las marcas deben estar en el tablero y haber sido cantadas
  const valid = markedCardIds.every(id => boardSet.has(id) && drawnSet.has(id));
  if (!valid) return null;

  return checkWin(board, markedCardIds);
}

module.exports = { generateBoard, shuffleDeck, checkWin, validateWin, WIN_PATTERNS, PATTERN_NAMES_ES };
