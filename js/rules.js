/* Checkers — game rules (American checkers). Pure logic, no DOM. */
(function () {
  'use strict';

  var CK = (window.CK = window.CK || {});

  var SIZE = 8;
  var YOU = 1;   // bottom side: moves up the board and moves first
  var CPU = -1;  // top side: moves down the board
  var DRAW_PLIES = 80; // 40 moves each without a capture or a man moving

  // A board is an array of 64 squares, index = row * 8 + col, row 0 at the top.
  // Each square holds 0 (empty), side * 1 (a man) or side * 2 (a king).

  var UP = [[-1, -1], [-1, 1]];
  var DOWN = [[1, -1], [1, 1]];
  var ALL = UP.concat(DOWN);

  function idx(r, c) { return r * SIZE + c; }
  function rowOf(i) { return (i / SIZE) | 0; }
  function colOf(i) { return i % SIZE; }
  function inBounds(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }
  function isDark(r, c) { return (r + c) % 2 === 1; }

  function owner(p) { return p > 0 ? YOU : p < 0 ? CPU : 0; }
  function isKing(p) { return p === 2 || p === -2; }
  function kingRow(side) { return side === YOU ? 0 : SIZE - 1; }

  // Men move and capture forward only; kings go both ways.
  function dirsFor(p) {
    if (isKing(p)) return ALL;
    return owner(p) === YOU ? UP : DOWN;
  }

  function emptyBoard() {
    var b = [];
    for (var i = 0; i < SIZE * SIZE; i++) b.push(0);
    return b;
  }

  // Twelve men each on the dark squares of the three rows nearest each player.
  function initialBoard() {
    var b = emptyBoard();
    for (var i = 0; i < b.length; i++) {
      var r = rowOf(i), c = colOf(i);
      if (!isDark(r, c)) continue;
      if (r < 3) b[i] = CPU;
      else if (r > 4) b[i] = YOU;
    }
    return b;
  }

  // quiet: plies since the last capture or man move (for the draw rule).
  function createGame(board) {
    return { board: board || initialBoard(), turn: YOU, quiet: 0, ply: 0 };
  }

  // Every jump sequence for the piece on `from`. A sequence goes on while another jump
  // is possible, no piece is jumped twice, and a man that reaches the far row is
  // crowned and stops there. A move is { path: [from, ..., to], caps: [jumped squares] }.
  function jumpsFrom(board, from, out) {
    var p = board[from];
    var side = owner(p);
    var dirs = dirsFor(p);
    var king = isKing(p);
    board[from] = 0; // the piece has left its square, so a king may land on it again

    function extend(at, path, caps) {
      var r = rowOf(at), c = colOf(at);
      var found = false;
      for (var k = 0; k < dirs.length; k++) {
        var lr = r + 2 * dirs[k][0], lc = c + 2 * dirs[k][1];
        if (!inBounds(lr, lc)) continue;
        var mid = idx(r + dirs[k][0], c + dirs[k][1]);
        var land = idx(lr, lc);
        if (owner(board[mid]) !== -side || board[land] !== 0 || caps.indexOf(mid) !== -1) continue;
        found = true;
        var nextPath = path.concat(land);
        var nextCaps = caps.concat(mid);
        if (!king && lr === kingRow(side)) out.push({ path: nextPath, caps: nextCaps });
        else extend(land, nextPath, nextCaps);
      }
      if (!found && caps.length) out.push({ path: path, caps: caps });
    }

    extend(from, [from], []);
    board[from] = p;
  }

  function stepsFrom(board, from, out) {
    var r = rowOf(from), c = colOf(from);
    var dirs = dirsFor(board[from]);
    for (var k = 0; k < dirs.length; k++) {
      var tr = r + dirs[k][0], tc = c + dirs[k][1];
      if (inBounds(tr, tc) && board[idx(tr, tc)] === 0) out.push({ path: [from, idx(tr, tc)], caps: [] });
    }
  }

  // Capturing is compulsory: if any jump exists, only jumps are legal.
  // The player may pick any jump sequence, not necessarily the longest.
  function legalMoves(board, side) {
    var moves = [];
    var i;
    for (i = 0; i < board.length; i++) {
      if (owner(board[i]) === side) jumpsFrom(board, i, moves);
    }
    if (moves.length) return moves;
    for (i = 0; i < board.length; i++) {
      if (owner(board[i]) === side) stepsFrom(board, i, moves);
    }
    return moves;
  }

  function landsOnKingRow(board, move) {
    var p = board[move.path[0]];
    return !isKing(p) && rowOf(move.path[move.path.length - 1]) === kingRow(owner(p));
  }

  // A new board with the move played. A man that reaches the far row becomes a king.
  function applyMove(board, move) {
    var b = board.slice();
    var from = move.path[0];
    var to = move.path[move.path.length - 1];
    var p = b[from];
    b[from] = 0;
    for (var k = 0; k < move.caps.length; k++) b[move.caps[k]] = 0;
    b[to] = landsOnKingRow(board, move) ? p * 2 : p;
    return b;
  }

  function play(game, move) {
    var manMoved = !isKing(game.board[move.path[0]]);
    return {
      board: applyMove(game.board, move),
      turn: -game.turn,
      quiet: move.caps.length || manMoved ? 0 : game.quiet + 1,
      ply: game.ply + 1
    };
  }

  function count(board, side) {
    var men = 0, kings = 0;
    for (var i = 0; i < board.length; i++) {
      if (owner(board[i]) !== side) continue;
      if (isKing(board[i])) kings++;
      else men++;
    }
    return { men: men, kings: kings, total: men + kings };
  }

  // null while the game goes on. Otherwise { winner, reason }: winner is YOU, CPU or 0
  // for a draw; reason is 'captured' (no pieces left), 'blocked' (no legal move) or 'quiet'.
  function outcome(game) {
    if (!legalMoves(game.board, game.turn).length) {
      return { winner: -game.turn, reason: count(game.board, game.turn).total ? 'blocked' : 'captured' };
    }
    if (game.quiet >= DRAW_PLIES) return { winner: 0, reason: 'quiet' };
    return null;
  }

  CK.rules = {
    SIZE: SIZE,
    YOU: YOU,
    CPU: CPU,
    DRAW_PLIES: DRAW_PLIES,
    idx: idx,
    rowOf: rowOf,
    colOf: colOf,
    isDark: isDark,
    owner: owner,
    isKing: isKing,
    emptyBoard: emptyBoard,
    initialBoard: initialBoard,
    createGame: createGame,
    legalMoves: legalMoves,
    landsOnKingRow: landsOnKingRow,
    applyMove: applyMove,
    play: play,
    count: count,
    outcome: outcome
  };
})();
