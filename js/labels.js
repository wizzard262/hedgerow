// Hedgerow: where the red score bubbles go when several targets show (no DOM, no 3D: page coordinates only, so it can be tested).
// Steve: a bubble or its arrow must not cover another piece that can be targeted. Each target has spots its bubble could
// go; the choice with the least in the way wins, nearest its own target when all else is equal
const Labels = (() => {
  // What each thing in the way costs: the first two are what Steve asked for, so they outweigh everything but the screen
  const COST = { offScreen: 100000, boxOnTarget: 10000, arrowOnTarget: 10000, boxOnOwn: 3000, boxOnBox: 2000, arrowOnBox: 1000, arrowCross: 800, far: 0.1 };
  // Bubbles keep this many pixels clear of each other and of the targets
  const CLEAR = 6;

  // How far a point is from a line segment
  function pointToSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }
  // Does a box touch a circle?
  function boxOnCircle(b, c, pad = 0) {
    const nx = Math.max(b.x, Math.min(c.x, b.x + b.w)), ny = Math.max(b.y, Math.min(c.y, b.y + b.h));
    return Math.hypot(c.x - nx, c.y - ny) < c.r + pad;
  }
  // Do two boxes touch?
  const boxOnBox = (a, b, pad = 0) => a.x - pad < b.x + b.w && b.x - pad < a.x + a.w && a.y - pad < b.y + b.h && b.y - pad < a.y + a.h;
  // Which way round three points turn
  const turn = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  // Do two line segments cross?
  const segmentsCross = (a, b, c, d) => turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0;
  // Does a line segment pass through a box?
  function segmentOnBox(a, b, box) {
    const inside = p => p.x > box.x && p.x < box.x + box.w && p.y > box.y && p.y < box.y + box.h;
    if (inside(a) || inside(b)) return true;
    const tl = { x: box.x, y: box.y }, tr = { x: box.x + box.w, y: box.y }, bl = { x: box.x, y: box.y + box.h }, br = { x: box.x + box.w, y: box.y + box.h };
    return segmentsCross(a, b, tl, tr) || segmentsCross(a, b, tr, br) || segmentsCross(a, b, br, bl) || segmentsCross(a, b, bl, tl);
  }
  // Does an arrow run over a target? Its point has to reach its own target, so a target right beside that one is only
  // counted up to where the arrow's point begins
  function arrowOnCircle(start, item, circle) {
    const own = item.circles[0], len = Math.hypot(item.aim.x - start.x, item.aim.y - start.y) || 1;
    const stop = Math.max(0, 1 - own.r / len);
    const end = { x: start.x + (item.aim.x - start.x) * stop, y: start.y + (item.aim.y - start.y) * stop };
    return pointToSegment(circle, start, end) < circle.r;
  }

  // What one spot costs its target, given where the others' bubbles are now
  function costOf(items, chosen, i, option, bounds) {
    const item = items[i], box = option.box, start = option.mid;
    let cost = COST.far * Math.hypot(item.aim.x - start.x, item.aim.y - start.y);
    if (box.x < bounds.x || box.y < bounds.y || box.x + box.w > bounds.x + bounds.w || box.y + box.h > bounds.y + bounds.h) cost += COST.offScreen;
    for (const c of item.circles) if (boxOnCircle(box, c, CLEAR)) cost += COST.boxOnOwn;
    items.forEach((other, j) => {
      if (j === i) return;
      for (const c of other.circles) {
        if (boxOnCircle(box, c, CLEAR)) cost += COST.boxOnTarget;
        if (arrowOnCircle(start, item, c)) cost += COST.arrowOnTarget;
      }
      const placed = chosen[j];
      if (placed === null) return;
      const theirs = other.options[placed];
      if (boxOnBox(box, theirs.box, CLEAR)) cost += COST.boxOnBox;
      if (segmentOnBox(start, item.aim, theirs.box)) cost += COST.arrowOnBox;
      if (segmentOnBox(theirs.mid, other.aim, box)) cost += COST.arrowOnBox;
      // Their arrow running over this target's own spot is charged to them; crossing arrows to both
      if (segmentsCross(start, item.aim, theirs.mid, other.aim)) cost += COST.arrowCross;
    });
    return cost;
  }

  // The spot chosen for each item: one at a time, left to right, then each looks again now the others are placed,
  // until nobody wants to move (a few goes at most)
  function placeInOrder(items, bounds, order) {
    const chosen = items.map(() => null);
    for (let go = 0; go < 8; go++) {
      let moved = false;
      for (const i of order) {
        let best = chosen[i], bestCost = best === null ? Infinity : costOf(items, chosen, i, items[i].options[best], bounds);
        items[i].options.forEach((option, n) => {
          const cost = costOf(items, chosen, i, option, bounds);
          if (cost < bestCost - 1e-6) { best = n; bestCost = cost; }
        });
        if (best !== chosen[i]) { chosen[i] = best; moved = true; }
      }
      if (!moved) break;
    }
    return chosen;
  }

  // Try the targets in several orders (who chooses first matters most in a tight cluster, the ones in the middle above
  // all) and keep whichever leaves the least in the way
  function place(items, bounds) {
    const all = items.map((_, i) => i);
    const midX = items.reduce((n, o) => n + o.aim.x, 0) / items.length, midY = items.reduce((n, o) => n + o.aim.y, 0) / items.length;
    const crowded = i => items.filter(o => Math.hypot(o.aim.x - items[i].aim.x, o.aim.y - items[i].aim.y) < 120).length;
    const orders = [
      all.slice().sort((a, b) => crowded(b) - crowded(a)),
      all.slice().sort((a, b) => items[a].aim.x - items[b].aim.x),
      all.slice().sort((a, b) => items[b].aim.x - items[a].aim.x),
      all.slice().sort((a, b) => items[a].aim.y - items[b].aim.y),
      all.slice().sort((a, b) => items[b].aim.y - items[a].aim.y),
      all.slice().sort((a, b) => Math.hypot(items[a].aim.x - midX, items[a].aim.y - midY) - Math.hypot(items[b].aim.x - midX, items[b].aim.y - midY)),
    ];
    let best = null, bestCost = Infinity;
    for (const order of orders) {
      const chosen = placeInOrder(items, bounds, order);
      const cost = items.reduce((n, item, i) => n + costOf(items, chosen, i, item.options[chosen[i]], bounds), 0);
      if (cost < bestCost) { best = chosen; bestCost = cost; }
    }
    return best;
  }

  // What is still in the way after placing: what Steve asked for, for the tests and for checking in the browser
  function problems(items, chosen) {
    // tipInside: an arrow's point lands inside another target's circle, the two cross-hairs overlapping on the page: no
    // spot for the bubble can help that
    const out = { boxOnTarget: 0, arrowOnTarget: 0, boxOnBox: 0, arrowCross: 0, tipInside: 0 };
    items.forEach((item, i) => {
      const mine = item.options[chosen[i]];
      items.forEach((other, j) => {
        if (j === i) return;
        for (const c of other.circles) {
          if (boxOnCircle(mine.box, c)) out.boxOnTarget++;
          if (Math.hypot(item.aim.x - c.x, item.aim.y - c.y) < c.r) out.tipInside++;
          else if (arrowOnCircle(mine.mid, item, c)) out.arrowOnTarget++;
        }
        if (j < i) return;
        const theirs = other.options[chosen[j]];
        if (boxOnBox(mine.box, theirs.box)) out.boxOnBox++;
        if (segmentsCross(mine.mid, item.aim, theirs.mid, other.aim)) out.arrowCross++;
      });
    });
    return out;
  }

  // Cross-hairs too close to tell apart (Steve: an arrow's point landed on the piece beside it): how far to nudge each one
  // on the page, so that none sits on another's cross-hair or base. points: { x, y, r, base: { x, y, r } }. Each pair
  // pushes apart a little at a time; two exactly together go opposite ways. Returns [{ dx, dy }], in pixels
  function spread(points) {
    const moved = points.map(() => ({ dx: 0, dy: 0 }));
    const at = i => ({ x: points[i].x + moved[i].dx, y: points[i].y + moved[i].dy });
    const push = (i, fromX, fromY, need) => {
      const p = at(i);
      let vx = p.x - fromX, vy = p.y - fromY, d = Math.hypot(vx, vy);
      if (d >= need) return false;
      const by = need - d;
      if (d < 1e-6) { const a = i * 2.4; vx = Math.cos(a); vy = Math.sin(a); d = 1; }
      moved[i].dx += vx / d * by; moved[i].dy += vy / d * by;
      return true;
    };
    for (let go = 0; go < 60; go++) {
      let any = false;
      for (let i = 0; i < points.length; i++) for (let j = 0; j < points.length; j++) {
        if (i === j) continue;
        const other = at(j), need = Math.max(points[i].r, points[j].r) + 2;
        if (push(i, other.x, other.y, need)) any = true;
        if (push(i, points[j].base.x, points[j].base.y, points[j].base.r + 2)) any = true;
      }
      if (!any) break;
    }
    return moved;
  }

  // Where a piece's pop-up menu goes (Steve: it covered fields to move or shoot from, pieces to rally and targets).
  // size: the menu's { w, h }; at: the piece on the page; blocked: the boxes to keep clear, each with a weight (a
  // target, a piece to rally or a score bubble matters more than a field to move to); box: the table's { width, height }.
  // For each distance out from the piece, nearest first, we try the spots round it (right, left, below, above, then the
  // corners), and last the table's own corners; the first that covers nothing wins, else the one that covers least
  const MENU_GAPS = [24, 90, 180, 300, 450, 650, 900];
  function menuSpot(size, at, blocked, box) {
    const { w, h } = size;
    const tries = [];
    for (const gap of MENU_GAPS) {
      tries.push([at.x + gap, at.y - h / 2], [at.x - gap - w, at.y - h / 2], [at.x - w / 2, at.y + gap], [at.x - w / 2, at.y - gap - h],
        [at.x + gap, at.y + gap], [at.x - gap - w, at.y + gap], [at.x + gap, at.y - gap - h], [at.x - gap - w, at.y - gap - h]);
    }
    tries.push([6, 6], [box.width - w - 6, 6], [6, box.height - h - 6], [box.width - w - 6, box.height - h - 6]);
    let best = null;
    for (const [x, y] of tries) {
      // Kept inside the table's box
      const spot = { x: Math.max(6, Math.min(box.width - w - 6, x)), y: Math.max(6, Math.min(box.height - h - 6, y)), w, h };
      const covered = blocked.reduce((sum, b) => sum + boxOverlap(spot, b) * (b.weight || 1), 0);
      if (!best || covered < best.covered) best = { ...spot, covered };
      if (!covered) break;
    }
    return best;
  }
  // How much of two boxes overlap (an area in pixels)
  function boxOverlap(a, b) {
    const across = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const down = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return across > 0 && down > 0 ? across * down : 0;
  }

  return { place, problems, spread, menuSpot };
})();

if (typeof module !== 'undefined') module.exports = Labels;
