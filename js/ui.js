/* Checkers — rendering, input and game flow. */
(function () {
  'use strict';

  var R = CK.rules;
  var AI = CK.ai;
  var YOU = R.YOU;
  var CPU = R.CPU;
  var STORE_KEY = 'checkers.level';
  var COMPUTER_DELAY = 400;

  function $(id) { return document.getElementById(id); }

  var els = {
    level: $('level'),
    newGame: $('new-game'),
    status: $('status'),
    result: $('result'),
    resultTitle: $('result-title'),
    resultText: $('result-text'),
    playAgain: $('play-again'),
    board: $('board'),
    youSide: $('you-side'),
    cpuSide: $('cpu-side'),
    youCount: $('you-count'),
    cpuCount: $('cpu-count')
  };

  var state;
  var timer = null;

  // ---- Settings ----

  function loadLevel() {
    try {
      var v = localStorage.getItem(STORE_KEY);
      if (AI.LEVELS.indexOf(v) !== -1) return v;
    } catch (e) { /* storage unavailable */ }
    return 'normal';
  }

  function saveLevel(v) {
    try { localStorage.setItem(STORE_KEY, v); } catch (e) { /* storage unavailable */ }
  }

  // ---- Building the DOM (once) ----

  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  // Only the dark squares are played on, so only they are buttons.
  var squares = [];
  var pieces = [];
  (function buildBoard() {
    for (var i = 0; i < R.SIZE * R.SIZE; i++) {
      var r = R.rowOf(i), c = R.colOf(i);
      if (!R.isDark(r, c)) {
        els.board.appendChild(el('span', 'sq'));
        squares.push(null);
        pieces.push(null);
        continue;
      }
      var b = el('button', 'sq');
      b.type = 'button';
      b.dataset.i = i;
      b.setAttribute('aria-label', 'abcdefgh'[c] + (R.SIZE - r));
      var p = el('span', 'piece none');
      b.appendChild(p);
      els.board.appendChild(b);
      squares.push(b);
      pieces.push(p);
    }
  })();

  // ---- Game flow ----

  function newGame() {
    clearTimeout(timer);
    state = {
      phase: 'play',
      game: R.createGame(),
      moves: null,  // legal moves for the side to move
      sel: null,    // squares chosen so far for your move: [from, step, ...]
      last: null,   // the move just played
      captured: { you: 0, cpu: 0 }
    };
    state.moves = R.legalMoves(state.game.board, YOU);
    setStatus('Your move. Click one of your red pieces, then the square to move it to.');
    render();
  }

  function mustCapture() {
    return state.moves.length > 0 && state.moves[0].caps.length > 0;
  }

  // Your legal moves that start with the squares chosen so far.
  function candidates() {
    if (!state.sel) return [];
    var sel = state.sel;
    return state.moves.filter(function (m) {
      for (var k = 0; k < sel.length; k++) if (m.path[k] !== sel[k]) return false;
      return m.path.length > sel.length;
    });
  }

  function onSquare(i) {
    if (state.phase !== 'play' || state.game.turn !== YOU) return;

    var next = candidates().filter(function (m) { return m.path[state.sel.length] === i; });
    if (next.length) {
      state.sel = state.sel.concat(i);
      // A jump sequence must be finished, so a path that is complete has no longer rival.
      var done = next.filter(function (m) { return m.path.length === state.sel.length; });
      if (done.length) {
        playerMove(done[0]);
        return;
      }
      setStatus('Keep jumping: pick the next square.');
      render();
      return;
    }

    if (R.owner(state.game.board[i]) === YOU) {
      var own = state.moves.filter(function (m) { return m.path[0] === i; });
      if (own.length) {
        state.sel = [i];
        setStatus(mustCapture() ? 'You must capture: jump to a marked square.' : 'Pick a marked square to move to.');
      } else {
        state.sel = null;
        setStatus(mustCapture()
          ? 'You must capture. Pick a piece with a green ring.'
          : 'That piece cannot move. Pick another one.');
      }
      render();
      return;
    }

    if (state.sel) {
      state.sel = null;
      setStatus(turnMessage(''));
      render();
    }
  }

  function apply(move) {
    var crowned = R.landsOnKingRow(state.game.board, move);
    state.captured[state.game.turn === YOU ? 'you' : 'cpu'] += move.caps.length;
    state.game = R.play(state.game, move);
    state.moves = R.legalMoves(state.game.board, state.game.turn);
    state.last = move;
    state.sel = null;
    return crowned;
  }

  function playerMove(move) {
    apply(move);
    if (finished('')) return;
    setStatus('The computer is thinking…');
    render();
    timer = setTimeout(computerTurn, COMPUTER_DELAY);
  }

  function computerTurn() {
    if (state.phase !== 'play') return;
    var move = AI.chooseMove(state.game, els.level.value);
    var n = move.caps.length;
    var crowned = apply(move);
    var msg = n === 0 ? 'The computer moved.'
      : 'The computer jumped ' + (n === 1 ? 'one' : n) + ' of your pieces.';
    if (crowned) msg += ' It has a new king.';
    if (finished(msg)) return;
    setStatus(turnMessage(msg));
    render();
  }

  function turnMessage(prefix) {
    return (prefix ? prefix + ' ' : '') + (mustCapture() ? 'Your move: you must capture.' : 'Your move.');
  }

  function finished(prefix) {
    var out = R.outcome(state.game);
    if (!out) return false;
    state.phase = 'over';
    var title, text, cls;
    if (out.winner === YOU) {
      title = 'Victory!';
      cls = 'win';
      text = out.reason === 'captured' ? 'You captured all the computer’s pieces.' : 'The computer has no move left.';
    } else if (out.winner === CPU) {
      title = 'Defeat';
      cls = 'loss';
      text = out.reason === 'captured' ? 'You have no pieces left.' : 'You have no move left.';
    } else {
      title = 'Draw';
      cls = '';
      text = 'Forty moves each without a capture or a man moving.';
    }
    var moves = Math.ceil(state.game.ply / 2);
    els.result.className = 'panel result ' + cls;
    els.resultTitle.textContent = title;
    els.resultText.textContent = 'The game lasted ' + moves + ' moves. You captured ' +
      state.captured.you + ' pieces and the computer captured ' + state.captured.cpu + '.';
    setStatus((prefix ? prefix + ' ' : '') + text);
    render();
    return true;
  }

  // ---- Rendering ----

  function setStatus(text) {
    els.status.textContent = text;
  }

  function countText(side) {
    var n = R.count(state.game.board, side);
    var who = side === YOU ? 'You' : 'Computer';
    return who + ': ' + n.total + (n.total === 1 ? ' piece' : ' pieces') +
      (n.kings ? ' (' + n.kings + (n.kings === 1 ? ' king)' : ' kings)') : '');
  }

  function render() {
    var board = state.game.board;
    var yourTurn = state.phase === 'play' && state.game.turn === YOU;
    var thinking = state.phase === 'play' && state.game.turn === CPU;

    var movable = {}, targets = {}, steps = {}, last = {};
    if (yourTurn) {
      state.moves.forEach(function (m) { movable[m.path[0]] = true; });
      if (state.sel) {
        candidates().forEach(function (m) { targets[m.path[state.sel.length]] = true; });
        state.sel.slice(1).forEach(function (i) { steps[i] = true; });
      }
    }
    if (state.last) state.last.path.forEach(function (i) { last[i] = true; });
    var must = yourTurn && !state.sel && mustCapture();

    for (var i = 0; i < squares.length; i++) {
      var b = squares[i];
      if (!b) continue;
      var cls = ['sq'];
      if (last[i]) cls.push('last');
      if (movable[i]) cls.push('movable');
      if (must && movable[i]) cls.push('must');
      if (state.sel && state.sel[0] === i) cls.push('selected');
      if (targets[i]) cls.push('target');
      if (steps[i]) cls.push('step');
      b.className = cls.join(' ');

      var p = board[i];
      pieces[i].className = p === 0 ? 'piece none'
        : 'piece ' + (R.owner(p) === YOU ? 'you' : 'cpu') + (R.isKing(p) ? ' king' : '');
    }

    els.board.classList.toggle('your-turn', yourTurn);
    els.board.classList.toggle('thinking', thinking);
    els.result.hidden = state.phase !== 'over';
    els.youSide.classList.toggle('active', yourTurn);
    els.cpuSide.classList.toggle('active', thinking);
    els.youCount.textContent = countText(YOU);
    els.cpuCount.textContent = countText(CPU);
  }

  // ---- Input ----

  els.board.addEventListener('click', function (e) {
    var b = e.target.closest('button.sq');
    if (b) onSquare(Number(b.dataset.i));
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.sel) {
      state.sel = null;
      setStatus(turnMessage(''));
      render();
    }
  });

  els.playAgain.addEventListener('click', newGame);
  els.newGame.addEventListener('click', function () {
    if (state.phase === 'play' && state.game.ply > 0 && !window.confirm('Abandon this game and start a new one?')) return;
    newGame();
  });
  els.level.addEventListener('change', function () { saveLevel(els.level.value); });

  els.level.value = loadLevel();
  newGame();
})();
