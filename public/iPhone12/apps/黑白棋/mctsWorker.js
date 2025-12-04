// Stronger 老手 AI worker: time-limited iterative deepening negamax with alpha-beta and simple TT
// Board uses values: 'black' | 'white' | null

// Message protocol: { type: 'search', board, isBlackTurn, timeLimit }
self.onmessage = function (e) {
	const { type, board, isBlackTurn, timeLimit, reqId } = e.data || {};
	if (type !== 'search' || !board) {
		self.postMessage({ row: -1, col: -1, score: -Infinity, reqId });
		return;
	}
	const limit = typeof timeLimit === 'number' ? timeLimit : 3000;
	const result = findBestMove(board, isBlackTurn, limit);
	self.postMessage((result && { ...result, reqId }) || { row: -1, col: -1, score: -Infinity, reqId });
};

const SIZE = 8;
const DIRS = [
	[-1, -1], [-1, 0], [-1, 1],
	[0, -1], /*self*/ [0, 1],
	[1, -1], [1, 0], [1, 1],
];
const POS_WEIGHTS = [
	[100, -10, 11, 6, 6, 11, -10, 100],
	[-10, -20, 1, 2, 2, 1, -20, -10],
	[11, 1, 5, 4, 4, 5, 1, 11],
	[6, 2, 4, 2, 2, 4, 2, 6],
	[6, 2, 4, 2, 2, 4, 2, 6],
	[11, 1, 5, 4, 4, 5, 1, 11],
	[-10, -20, 1, 2, 2, 1, -20, -10],
	[100, -10, 11, 6, 6, 11, -10, 100],
];

function cloneBoard(board) {
	return board.map(row => row.slice());
}

function serialize(board) {
	let s = '';
	for (let r = 0; r < SIZE; r++) {
		for (let c = 0; c < SIZE; c++) {
			const v = board[r][c];
			s += v === 'black' ? 'b' : v === 'white' ? 'w' : '.';
		}
	}
	return s;
}

function other(color) { return color === 'black' ? 'white' : 'black'; }

function inBounds(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }

function getFlipsInDir(board, r, c, dr, dc, me) {
	let rr = r + dr, cc = c + dc;
	const flips = [];
	const opp = other(me);
	while (inBounds(rr, cc) && board[rr][cc] === opp) {
		flips.push([rr, cc]);
		rr += dr; cc += dc;
	}
	if (inBounds(rr, cc) && board[rr][cc] === me && flips.length > 0) {
		return flips;
	}
	return [];
}

function getValidMoves(board, me) {
	const moves = [];
	for (let r = 0; r < SIZE; r++) {
		for (let c = 0; c < SIZE; c++) {
			if (board[r][c] !== null) continue;
			let allFlips = null; // lazily allocate
			for (const [dr, dc] of DIRS) {
				const flips = getFlipsInDir(board, r, c, dr, dc, me);
				if (flips.length) {
					if (!allFlips) allFlips = [];
					for (let i = 0; i < flips.length; i++) allFlips.push(flips[i]);
				}
			}
			if (allFlips && allFlips.length) {
				moves.push({ row: r, col: c, flips: allFlips });
			}
		}
	}
	return moves;
}

function applyMove(board, move, me) {
	const nb = board; // mutate for speed on a cloned board by caller
	nb[move.row][move.col] = me;
	for (let i = 0; i < move.flips.length; i++) {
		const [r, c] = move.flips[i];
		nb[r][c] = me;
	}
	return nb;
}

function countDiscs(board, color) {
	let count = 0;
	for (let r = 0; r < SIZE; r++)
		for (let c = 0; c < SIZE; c++) if (board[r][c] === color) count++;
	return count;
}

function cornersScore(board, me) {
	const corners = [[0,0],[0,7],[7,0],[7,7]];
	let s = 0;
	for (const [r,c] of corners) {
		if (board[r][c] === me) s += 25;
		else if (board[r][c] === other(me)) s -= 25;
	}
	return s;
}

function mobility(board, me) {
	return getValidMoves(board, me).length - getValidMoves(board, other(me)).length;
}

function positional(board, me) {
	let s = 0;
	for (let r = 0; r < SIZE; r++)
		for (let c = 0; c < SIZE; c++) {
			if (board[r][c] === me) s += POS_WEIGHTS[r][c];
			else if (board[r][c] === other(me)) s -= POS_WEIGHTS[r][c];
		}
	return s;
}

function evalBoard(board, me) {
	// phase-based weighting
	let empties = 0;
	for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c] === null) empties++;
	const early = empties > 40;
	const mid = empties > 16 && empties <= 40;
	const late = empties <= 16;
	let score = 0;
	if (early) score = 0.6 * positional(board, me) + 0.4 * mobility(board, me) + cornersScore(board, me);
	else if (mid) score = 0.5 * positional(board, me) + 0.5 * mobility(board, me) + 1.5 * cornersScore(board, me);
	else score = 0.3 * positional(board, me) + 0.7 * (countDiscs(board, me) - countDiscs(board, other(me))) + 2.0 * cornersScore(board, me);
	return score;
}

function isTerminal(board) {
	const empty = hasEmpty(board);
	if (!empty) return true;
	// no moves for both players
	return getValidMoves(board, 'black').length === 0 && getValidMoves(board, 'white').length === 0;
}

function hasEmpty(board) {
	for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c] === null) return true;
	return false;
}

// Transposition table (simple)
const TT = new Map(); // key -> { depth, score, flag, best }
const FLAG_EXACT = 0, FLAG_LOWER = 1, FLAG_UPPER = 2;

function ttKey(board, me) { return serialize(board) + '|' + (me === 'black' ? 'b' : 'w'); }

function orderMoves(board, me, moves) {
	// Prefer corners, then position weight, then flips (greedy), then center
	return moves.sort((a, b) => {
		const aw = POS_WEIGHTS[a.row][a.col];
		const bw = POS_WEIGHTS[b.row][b.col];
		const ac = ( (a.row===0||a.row===7)&&(a.col===0||a.col===7) ) ? 1000 : 0;
		const bc = ( (b.row===0||b.row===7)&&(b.col===0||b.col===7) ) ? 1000 : 0;
		const af = a.flips.length, bf = b.flips.length;
		return (bc+ bw + bf*0.1) - (ac+ aw + af*0.1);
	});
}

function findBestMove(board, isBlackTurn, timeLimitMs) {
	const me = isBlackTurn ? 'black' : 'white';
	const start = Date.now();
	let timeUp = false;
	let best = null;
	let bestScore = -Infinity;
	const rootMoves = orderMoves(board, me, getValidMoves(board, me));
	if (rootMoves.length === 0) return null;

	// Iterative deepening
	for (let depth = 1; depth <= 20; depth++) {
		let localBest = best;
		let localScore = -Infinity;
		for (let i = 0; i < rootMoves.length; i++) {
			if (Date.now() - start > timeLimitMs) { timeUp = true; break; }
			const move = rootMoves[i];
			const nb = cloneBoard(board);
			applyMove(nb, move, me);
			const score = -negamax(nb, depth - 1, -Infinity, Infinity, other(me), start, timeLimitMs);
			if (score > localScore) {
				localScore = score;
				localBest = move;
			}
		}
		if (!timeUp) { best = localBest; bestScore = localScore; }
		if (Date.now() - start > timeLimitMs) break;
	}
	return best ? { row: best.row, col: best.col, score: bestScore } : null;
}

function negamax(board, depth, alpha, beta, me, start, limit) {
	if (Date.now() - start > limit) return evalBoard(board, me);
	if (depth === 0 || isTerminal(board)) {
		// If terminal, use disc difference to strongly prefer win
		if (isTerminal(board)) {
			const diff = countDiscs(board, me) - countDiscs(board, other(me));
			return diff * 1000; // big margin near terminal
		}
		return evalBoard(board, me);
	}
	const key = ttKey(board, me);
	const tt = TT.get(key);
	if (tt && tt.depth >= depth) {
		if (tt.flag === FLAG_EXACT) return tt.score;
		else if (tt.flag === FLAG_LOWER) alpha = Math.max(alpha, tt.score);
		else if (tt.flag === FLAG_UPPER) beta = Math.min(beta, tt.score);
		if (alpha >= beta) return tt.score;
	}
	let value = -Infinity;
	const moves = orderMoves(board, me, getValidMoves(board, me));
	if (moves.length === 0) {
		// pass move
		return -negamax(board, depth - 1, -beta, -alpha, other(me), start, limit);
	}
	let bestMove = null;
	for (let i = 0; i < moves.length; i++) {
		if (Date.now() - start > limit) break;
		const move = moves[i];
		const nb = cloneBoard(board);
		applyMove(nb, move, me);
		const score = -negamax(nb, depth - 1, -beta, -alpha, other(me), start, limit);
		if (score > value) { value = score; bestMove = move; }
		if (value > alpha) alpha = value;
		if (alpha >= beta) break; // beta cut-off
	}
	let flag = FLAG_EXACT;
	if (value <= alpha) flag = FLAG_UPPER; // fail-low
	else if (value >= beta) flag = FLAG_LOWER; // fail-high
	TT.set(key, { depth, score: value, flag, best: bestMove });
	return value;
}
