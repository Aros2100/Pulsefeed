// Bradley-Terry rating computed via MM (minorization-maximization) iteration.
//
// Each article has a latent skill π_i > 0. The probability that article i
// beats article j is π_i / (π_i + π_j). We estimate π by maximum likelihood
// over the observed decided pairs.
//
// Regularization: every article gets ALPHA virtual wins and ALPHA virtual
// losses against a phantom opponent with fixed π = 1. This keeps π_i finite
// even for articles that won or lost all their real pairs, and anchors the
// absolute scale (so we don't need to renormalize π during iteration).
//
// Final β = log π, mean-centered across articles so the average β is 0.

const ALPHA = 0.5;
const TOL = 1e-6;
const MAX_ITER = 1000;

export interface BTPair {
  winnerId: string;
  loserId: string;
}

export interface BTResult {
  betas: Map<string, number>;
  iterations: number;
  converged: boolean;
}

export function computeBradleyTerry(articleIds: string[], pairs: BTPair[]): BTResult {
  const n = articleIds.length;
  if (n === 0) return { betas: new Map(), iterations: 0, converged: true };

  // Index articles for tight array-based iteration
  const idx = new Map<string, number>();
  articleIds.forEach((id, i) => idx.set(id, i));

  const wins = new Float64Array(n);
  // games[i] = array of { j, count } neighbours
  const neighbours: Array<Array<{ j: number; count: number }>> = Array.from({ length: n }, () => []);
  const neighbourMap: Array<Map<number, number>> = Array.from({ length: n }, () => new Map());

  for (const p of pairs) {
    const wi = idx.get(p.winnerId);
    const li = idx.get(p.loserId);
    if (wi === undefined || li === undefined) continue;
    wins[wi] += 1;
    neighbourMap[wi].set(li, (neighbourMap[wi].get(li) ?? 0) + 1);
    neighbourMap[li].set(wi, (neighbourMap[li].get(wi) ?? 0) + 1);
  }
  for (let i = 0; i < n; i++) {
    for (const [j, count] of neighbourMap[i]) {
      neighbours[i].push({ j, count });
    }
  }

  const pi = new Float64Array(n).fill(1);
  const piNext = new Float64Array(n);

  let iter = 0;
  let converged = false;
  for (; iter < MAX_ITER; iter++) {
    let maxDelta = 0;
    for (let i = 0; i < n; i++) {
      const piI = pi[i];
      const num = wins[i] + ALPHA;
      let denom = (2 * ALPHA) / (piI + 1);
      const list = neighbours[i];
      for (let k = 0; k < list.length; k++) {
        denom += list[k].count / (piI + pi[list[k].j]);
      }
      const next = denom > 0 ? num / denom : piI;
      piNext[i] = next;
      const d = Math.abs(next - piI);
      if (d > maxDelta) maxDelta = d;
    }
    for (let i = 0; i < n; i++) pi[i] = piNext[i];
    if (maxDelta < TOL) {
      converged = true;
      iter++;
      break;
    }
  }

  const betas = new Map<string, number>();
  let sum = 0;
  const logs = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    logs[i] = Math.log(pi[i]);
    sum += logs[i];
  }
  const mean = sum / n;
  for (let i = 0; i < n; i++) {
    betas.set(articleIds[i], logs[i] - mean);
  }

  return { betas, iterations: iter, converged };
}
