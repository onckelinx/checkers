/* Checkers — computer opponent. Pure logic, no DOM. */
(function () {
  'use strict';

  var R = CK.rules;

  var LEVELS = ['easy', 'normal', 'hard'];

  // depth: plies searched. extend: keep searching while a capture is pending, so the
  // computer never stops looking in the middle of an exchange. noise: random points
  // added to each root move, so Easy sometimes picks a weaker move.
  var SETTINGS = {
    easy: { depth: 2, extend: false, noise: 40 },
    normal: { depth: 4, extend: true, noise: 0 },
    hard: { depth: 8, extend: true, noise: 0 }
  };

  var WIN = 100000;
  var MAX_PLY = 40;
  var MAN = 100;
  var KING = 150;

  // Square values for YOU's pieces; the computer's are the same board turned round.
  // Men gain value as they advance and when they guard the home row; kings prefer the centre.
  var MAN_YOU = [], KING_SQ = [];
  (function () {
    for (var i = 0; i < 64; i++) {
      var r = R.rowOf(i), c = R.colOf(i);
      var centre = 7 - (Math.abs(2 * r - 7) + Math.abs(2 * c - 7)); // 0 at the edge corners, 6 in the centre
      MAN_YOU.push(MAN + (7 - r) * 4 + (r === 7 ? 8 : 0) + centre);
      KING_SQ.push(KING + centre * 2);
    }
  })();

  // Score of a board from YOU's point of view.
  function evaluate(board) {
    var score = 0, youMat = 0, cpuMat = 0;
    var youKings = [], cpuKings = [], youAll = [], cpuAll = [];
    for (var i = 0; i < 64; i++) {
      var p = board[i];
      if (p === 0) continue;
      if (p === 1) { score += MAN_YOU[i]; youMat += MAN; youAll.push(i); }
      else if (p === 2) { score += KING_SQ[i]; youMat += KING; youKings.push(i); youAll.push(i); }
      else if (p === -1) { score -= MAN_YOU[63 - i]; cpuMat += MAN; cpuAll.push(i); }
      else { score -= KING_SQ[i]; cpuMat += KING; cpuKings.push(i); cpuAll.push(i); }
    }
    if (youMat === cpuMat) return score;

    // The side that is ahead wants to trade pieces and close in with its kings.
    var ahead = youMat > cpuMat ? 1 : -1;
    var pieces = youAll.length + cpuAll.length;
    score += ahead * (24 - pieces) * 4;
    var hunters = ahead === 1 ? youKings : cpuKings;
    var prey = ahead === 1 ? cpuAll : youAll;
    for (var h = 0; h < hunters.length; h++) {
      var nearest = 8;
      for (var q = 0; q < prey.length; q++) {
        var d = Math.max(Math.abs(R.rowOf(hunters[h]) - R.rowOf(prey[q])),
          Math.abs(R.colOf(hunters[h]) - R.colOf(prey[q])));
        if (d < nearest) nearest = d;
      }
      score -= ahead * nearest * 3;
    }
    return score;
  }

  // Negamax with alpha-beta pruning. Returns the score for `side`, the side to move.
  function search(board, side, depth, alpha, beta, ply, s) {
    var moves = R.legalMoves(board, side);
    if (!moves.length) return -WIN + ply; // no move left: a loss, the later the better
    var capturing = moves[0].caps.length > 0;
    if (depth <= 0 && !(s.extend && capturing && ply < MAX_PLY)) return side * evaluate(board);
    if (capturing) moves.sort(function (a, b) { return b.caps.length - a.caps.length; });

    var best = -Infinity;
    for (var k = 0; k < moves.length; k++) {
      var score = -search(R.applyMove(board, moves[k]), -side, depth - 1, -beta, -alpha, ply + 1, s);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  function shuffle(list, rng) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list;
  }

  // The computer's move for the side to move in `game`.
  function chooseMove(game, level, rng) {
    rng = rng || Math.random;
    var s = SETTINGS[level] || SETTINGS.normal;
    var side = game.turn;
    var moves = R.legalMoves(game.board, side);
    if (moves.length <= 1) return moves[0] || null;

    // Shuffled, so equally good moves are picked at random.
    shuffle(moves, rng);
    var best = null, bestScore = -Infinity;
    for (var k = 0; k < moves.length; k++) {
      // With noise every root move needs an exact score, so it gets the full window.
      var alpha = s.noise ? -Infinity : bestScore;
      var score = -search(R.applyMove(game.board, moves[k]), -side, s.depth - 1, -Infinity, -alpha, 1, s);
      if (s.noise) score += (rng() - 0.5) * s.noise * 2;
      if (score > bestScore) {
        bestScore = score;
        best = moves[k];
      }
    }
    return best;
  }

  CK.ai = {
    LEVELS: LEVELS,
    evaluate: evaluate,
    chooseMove: chooseMove
  };
})();
