import { approach, clamp, overlaps } from "./core.js";
export function createPlayer(spawn, config) {
  return {
    x: spawn.x,
    y: spawn.y,
    w: config.width,
    h: config.height,
    vx: 0,
    vy: 0,
    facing: spawn.facing || 1,
    grounded: false,
    wasGrounded: false,
    wall: 0,
    wallSurface: null,
    coyote: 0,
    jumpBuffer: 0,
    dashTime: 0,
    dashReady: true,
    wallLock: 0,
    dropTime: 0,
    invulnerable: 0,
    hurtTime: 0,
    state: "fall",
    contact: null,
    attackTime: 0,
    attackId: 0,
    trail: [],
    stepTimer: 0,
  };
}
export function activeSurfaces(room, flags, conditionMet, time = 0) {
  return room.collisionLayers
    .filter((s) => conditionMet(s.requires, flags))
    .map((s) => {
      if (!s.motion) return s;
      const offset = Math.sin(time * s.motion.speed) * s.motion.distance;
      return { ...s, [s.motion.axis]: s[s.motion.axis] + offset };
    });
}
export function moveBody(p, dx, dy, surfaces) {
  p.contact = null;
  if (dx) {
    let allowed = dx;
    for (const s of surfaces) {
      if (s.kind === "oneWay" || s.kind === "hazard") continue;
      if (p.y + p.h <= s.y + 0.01 || p.y >= s.y + s.h - 0.01) continue;
      if (dx > 0 && p.x + p.w <= s.x + 0.01 && p.x + p.w + allowed >= s.x)
        allowed = Math.min(allowed, s.x - p.x - p.w);
      if (dx < 0 && p.x >= s.x + s.w - 0.01 && p.x + allowed <= s.x + s.w)
        allowed = Math.max(allowed, s.x + s.w - p.x);
    }
    p.x += allowed;
    if (Math.abs(allowed - dx) > 0.001) {
      p.vx = 0;
      p.dashTime = 0;
      p.contact = { axis: "x", normal: dx > 0 ? -1 : 1 };
    }
  }
  p.grounded = false;
  if (dy >= 0) {
    let allowed = dy;
    for (const s of surfaces) {
      if (s.kind === "hazard" || (s.kind === "oneWay" && p.dropTime > 0))
        continue;
      if (p.x + p.w <= s.x + 0.01 || p.x >= s.x + s.w - 0.01) continue;
      if (p.y + p.h <= s.y + 0.1 && p.y + p.h + allowed >= s.y - 0.01) {
        allowed = Math.max(0, s.y - p.y - p.h);
        p.grounded = true;
        p.contact = { axis: "y", normal: -1, surface: s.id };
      }
    }
    p.y += allowed;
    if (p.grounded) p.vy = 0;
  } else {
    let allowed = dy;
    for (const s of surfaces) {
      if (s.kind === "oneWay" || s.kind === "hazard") continue;
      if (p.x + p.w <= s.x + 0.01 || p.x >= s.x + s.w - 0.01) continue;
      if (p.y >= s.y + s.h - 0.01 && p.y + allowed <= s.y + s.h)
        allowed = Math.max(allowed, s.y + s.h - p.y);
    }
    p.y += allowed;
    if (Math.abs(allowed - dy) > 0.001) {
      p.vy = 0;
      p.contact = { axis: "y", normal: 1 };
    }
  }
}
export function updatePlayer(
  p,
  input,
  dt,
  surfaces,
  config,
  abilities,
  bounds,
  emit = () => {},
) {
  const wasGrounded = p.grounded;
  const previousState = p.state;
  for (const k of ["wallLock", "dropTime", "invulnerable", "hurtTime"])
    p[k] = Math.max(0, p[k] - dt);
  p.coyote = p.grounded ? config.coyoteTime : Math.max(0, p.coyote - dt);
  p.jumpBuffer = input.pressed("jump")
    ? config.jumpBuffer
    : Math.max(0, p.jumpBuffer - dt);
  const axis = Number(input.down("right")) - Number(input.down("left"));
  p.wall = 0;
  p.wallSurface = null;
  for (const s of surfaces) {
    if (
      s.kind === "oneWay" ||
      s.kind === "hazard" ||
      !s.grippable ||
      p.y + p.h <= s.y + 2 ||
      p.y >= s.y + s.h - 2
    )
      continue;
    if (Math.abs(p.x + p.w - s.x) < 2) {
      p.wall = 1;
      p.wallSurface = s.id;
    } else if (Math.abs(p.x - s.x - s.w) < 2) {
      p.wall = -1;
      p.wallSurface = s.id;
    }
  }
  if (input.pressed("jump") && input.down("down") && p.grounded) {
    p.dropTime = config.dropTime;
    p.jumpBuffer = 0;
    p.y += 2;
    p.grounded = false;
  }
  if (p.jumpBuffer > 0 && p.dashTime <= 0 && p.hurtTime <= 0) {
    if (p.coyote > 0) {
      p.vy = -config.jumpSpeed;
      p.grounded = false;
      p.coyote = 0;
      p.jumpBuffer = 0;
      emit("jump");
    } else if (abilities.wall_grip && p.wall && p.wallLock <= 0) {
      p.vx = -p.wall * config.wallJumpX;
      p.vy = -config.wallJumpY;
      p.facing = -p.wall;
      p.wallLock = config.wallLockTime;
      p.jumpBuffer = 0;
      if (config.wallRestoresDash) p.dashReady = true;
      emit("wallJump");
    }
  }
  if (
    !input.down("jump") &&
    p.vy < -config.jumpSpeed * config.jumpCut &&
    p.wallLock <= 0
  )
    p.vy = -config.jumpSpeed * config.jumpCut;
  if (
    input.pressed("dash") &&
    abilities.dash &&
    !p.grounded &&
    p.dashReady &&
    p.dashTime <= 0 &&
    p.hurtTime <= 0
  ) {
    p.dashTime = config.dashDuration;
    p.dashReady = false;
    p.vy = 0;
    if (axis) p.facing = axis;
    emit("dash");
  }
  if (p.dashTime > 0) {
    p.dashTime = Math.max(0, p.dashTime - dt);
    p.vx = p.facing * config.dashSpeed;
    p.vy = 0;
    p.state = "dash";
  } else {
    if (p.wallLock <= 0 && p.hurtTime <= 0) {
      p.vx = approach(
        p.vx,
        axis * config.maxSpeed,
        (axis
          ? p.grounded
            ? config.acceleration
            : config.airAcceleration
          : config.braking) * dt,
      );
      if (axis) p.facing = axis;
    }
    p.vy = Math.min(
      config.maxFallSpeed,
      p.vy + (p.vy < 0 ? config.riseGravity : config.fallGravity) * dt,
    );
    if (
      abilities.wall_grip &&
      p.wall &&
      axis === p.wall &&
      p.vy > 0 &&
      p.wallLock <= 0
    ) {
      p.vy = Math.min(p.vy, config.wallSlideSpeed);
      p.state = "wall";
      if (previousState !== "wall") emit("wallGrip");
    } else
      p.state = p.grounded
        ? Math.abs(p.vx) > 15
          ? "run"
          : "idle"
        : p.vy < 0
          ? "rise"
          : "fall";
  }
  moveBody(p, p.vx * dt, p.vy * dt, surfaces);
  p.x = clamp(p.x, 0, bounds.w - p.w);
  if (p.y < 0) {
    p.y = 0;
    p.vy = Math.max(0, p.vy);
  }
  if (p.grounded) {
    if (!p.dashReady) emit("dashRecharge");
    p.dashReady = true;
    if (!wasGrounded) emit("land");
  }
  if (p.hurtTime > 0) p.state = "hurt";
  if (p.y > bounds.h + 100) emit("fallOut");
  if (surfaces.some((s) => s.kind === "hazard" && overlaps(p, s)))
    emit("hazard");
  p.wasGrounded = wasGrounded;
}
export function attackBox(p, config) {
  return {
    x: p.facing > 0 ? p.x + p.w : p.x - config.attackRange,
    y: p.y - 8,
    w: config.attackRange,
    h: p.h + 12,
  };
}
export function lineBlocked(a, b, surfaces) {
  const ray = {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y) - 1,
    w: Math.max(1, Math.abs(a.x - b.x)),
    h: 2,
  };
  return surfaces.some(
    (s) => s.kind !== "oneWay" && s.kind !== "hazard" && overlaps(ray, s),
  );
}
