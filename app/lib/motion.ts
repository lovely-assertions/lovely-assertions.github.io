/**
 * The animation layer.
 *
 * GSAP, because the design is written in its vocabulary: `back.out(3)`,
 * `elastic.out(1, 0.5)`, `stagger`, `yoyo`, `repeat`. Those are exact
 * behaviours, and a keyframe approximation of an elastic settle is a different
 * curve wearing the same name. Using the same engine the design was authored in
 * means the numbers in the spec are the numbers in the code.
 *
 * Two rules hold everywhere here:
 *
 * Reduced motion disables the JavaScript too, not only the CSS. Every entry
 * point checks first and returns without building a timeline, so a reader who
 * asked for less motion gets none — not a faster version of it.
 *
 * Animated colours are hex. GSAP interpolates hex reliably; from `oklch()` it
 * writes nonsense, so the three logo dots, the mint they tween to and the
 * nav-link hover are all authored as hex, and their resting values match.
 */

import type Gsap from 'gsap'
import { DOT_COLOURS, MINT, NAV_INK, NAV_INK_HOVER } from './palette.ts'

export { DOT_COLOURS, MINT, NAV_INK, NAV_INK_HOVER }

/*
 * GSAP arrives in its own chunk, and nothing waits for it.
 *
 * Statically imported it was 69,616 bytes raw / 26,874 gzip inside the shared
 * entry chunk -- 88% of that chunk, and 19% of the 141 KB gzip a documentation
 * page downloads -- all of it parsed and evaluated before hydration could
 * start. Nothing it drives happens during that window: the earliest is the logo
 * playing itself 450ms in, and every other entry point here is a response to a
 * pointer, a key or a press.
 *
 * The import is kicked off the moment this module is evaluated, not on an idle
 * callback, so in practice the engine is here well before anything asks for it.
 * What changed is that it is fetched *beside* the page rather than in front of
 * it.
 *
 * This is the only module that imports it. Three components used to reach for
 * `gsap.context` and `gsap.timeline` directly, which is what made a lazy import
 * impossible and put animation vocabulary in the component tree.
 */
type Engine = typeof Gsap

let engine: Engine | null = null
let arriving: Promise<Engine> | null = null

function load(): Promise<Engine> {
  arriving ??= import('gsap').then((module) => {
    engine = module.default
    return engine
  })
  return arriving
}

// Kicked off the moment this module is evaluated in a browser -- and only in a
// browser, because the prerender runs under Node, where nothing animates and
// pulling in an animation engine would be pure cost.
if (typeof window !== 'undefined') void load()

/**
 * Run something with GSAP: now if it is here, on arrival if it is not.
 *
 * Returns a canceller, for the callers that can be torn down while waiting.
 * Everything triggered by an interaction ignores it -- by then the engine has
 * long since landed, and a tween that starts a frame late is not a bug worth a
 * flag.
 */
function withGsap(job: (gsap: Engine) => void): () => void {
  if (engine) {
    job(engine)
    return () => {}
  }
  if (typeof window === 'undefined') return () => {}

  let cancelled = false
  void load().then((gsap) => {
    if (!cancelled) job(gsap)
  })
  return () => {
    cancelled = true
  }
}

/**
 * A handle to an animation that may not exist yet.
 *
 * `play` before the engine lands is remembered and honoured on arrival; `kill`
 * before it lands cancels the build outright. The alternative -- returning a
 * promise -- would push `await` into three components for the sake of a
 * dependency that is already in flight.
 */
export interface Motion {
  play(): void
  destroy(): void
}

const DEAD: Motion = { play() {}, destroy() {} }

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Throw a few coloured dots out of an element and let them fade.
 *
 * The one effect that genuinely needs script rather than a stylesheet: the
 * nodes do not exist until the interaction happens, and they are removed
 * afterwards rather than left in the DOM for a screen reader to step over.
 */
export function sparkle(host: HTMLElement, count = 2, top = '38%'): void {
  if (prefersReducedMotion()) return

  for (let index = 0; index < count; index += 1) {
    const dot = document.createElement('span')
    const size = 3 + Math.random() * 2

    dot.setAttribute('aria-hidden', 'true')
    dot.dataset.sparkle = ''
    Object.assign(dot.style, {
      position: 'absolute',
      // Percentages of the host, so the same call works on a nav link and on a
      // headline word. Every host that sparkles establishes a containing block.
      insetInlineStart: `${10 + Math.random() * 70}%`,
      insetBlockStart: top,
      inlineSize: `${size}px`,
      blockSize: `${size}px`,
      borderRadius: '50%',
      // Drawn at random rather than in turn: a fixed cycle reads as a pattern
      // the second time you see it.
      backgroundColor:
        DOT_COLOURS[Math.floor(Math.random() * DOT_COLOURS.length)] ?? DOT_COLOURS[0],
      opacity: '0.9',
      pointerEvents: 'none',
    })

    host.append(dot)

    withGsap((gsap) =>
      gsap.to(dot, {
        y: -14 - Math.random() * 10,
        x: (Math.random() - 0.5) * 16,
        opacity: 0,
        scale: 0.3,
        duration: 0.7 + Math.random() * 0.3,
        ease: 'power2.out',
        onComplete: () => dot.remove(),
      }),
    )
  }
}

/**
 * Scroll to an anchor, clearing the sticky header, and take focus with it.
 *
 * Deliberately not `scrollIntoView`: it takes no offset, so a heading lands
 * underneath the header and the reader sees the wrong section.
 *
 * The offset is read off the document rather than typed here. `html` carries
 * `scroll-padding-block-start` for every jump the browser performs itself, and
 * a second number in this file would be the same fact spelled twice -- free to
 * drift, and invisible when it did, because the two paths to a heading are the
 * contents rail and everything else.
 *
 * Focus moves too, and that is the whole reason both call sites go through
 * here. They each cancel the browser's fragment navigation to get the offset,
 * and cancelling it also discards the one thing that moves the sequential focus
 * starting point: without this the viewport scrolled while the reading cursor
 * and the next Tab stayed in the contents rail, so for a keyboard or screen
 * reader user the link did nothing at all. WCAG 2.4.3.
 */
export function scrollToAnchor(target: Element, offset = anchorOffset()): void {
  const top = target.getBoundingClientRect().top + window.scrollY - offset
  window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })

  // Headings are not focusable, so they are lent a programmatic-only tab stop.
  // `preventScroll` because the scroll above is the one that should happen.
  if (!(target instanceof HTMLElement)) return
  if (!target.hasAttribute('tabindex')) target.tabIndex = -1
  target.focus({ preventScroll: true })
}

/** The header clearance the stylesheet already declares, in pixels. */
function anchorOffset(): number {
  const declared = getComputedStyle(document.documentElement).scrollPaddingBlockStart
  return Number.parseFloat(declared) || 0
}

/**
 * Back to the top of the page.
 *
 * Through here rather than a `window.scrollTo` at the call site: an explicit
 * `behavior` in the options object beats `scroll-behavior` in the stylesheet,
 * so the reduced-motion rule in the CSS cannot rescue a hardcoded `'smooth'`.
 */
export function scrollToTop(): void {
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}

/** Long enough for the first paint to be over, short enough to still be noticed. */
const LOGO_AUTOPLAY_MS = 450

/** The run plus a beat, so a sweep across the navbar cannot stutter it. */
const LOGO_REPLAY_LOCK_MS = 500

/**
 * The logo's "assertion passes" timeline, mounted on an element.
 *
 * Built paused and replayed, rather than rebuilt per trigger: restarting one
 * timeline is what makes a second hover pick up cleanly instead of stacking a
 * new set of tweens on top of the running one.
 *
 * Scoped through `gsap.context`, so one call reverts every tween and every
 * inline style this wrote. The autoplay and the replay lock live here too: they
 * are timings of the animation, and keeping them in the component was what put
 * `gsap.delayedCall` in a file that should not know the engine exists.
 */
export function mountLogo(root: HTMLElement): Motion {
  if (prefersReducedMotion()) return DEAD

  let timeline: gsap.core.Timeline | null = null
  let queued = false
  let locked = false
  let destroyed = false
  let context: gsap.Context | null = null
  let autoplay: ReturnType<typeof setTimeout> | null = null

  const cancel = withGsap((gsap) => {
    if (destroyed) return
    context = gsap.context(() => {
      timeline = buildLogoTimeline(gsap, root)
      if (timeline && queued) timeline.restart()
    }, root)
  })

  // A plain timer, not `gsap.delayedCall`: it has to run whether or not the
  // engine has arrived, and the restart it asks for queues if it has not.
  autoplay = setTimeout(() => {
    if (timeline) timeline.restart()
    else queued = true
  }, LOGO_AUTOPLAY_MS)

  return {
    play() {
      if (locked || destroyed) return
      locked = true
      if (timeline) timeline.restart()
      else queued = true
      setTimeout(() => {
        locked = false
      }, LOGO_REPLAY_LOCK_MS)
    },
    destroy() {
      destroyed = true
      cancel()
      if (autoplay) clearTimeout(autoplay)
      context?.revert()
      timeline = null
    },
  }
}

function buildLogoTimeline(gsap: Engine, root: HTMLElement): gsap.core.Timeline | null {
  const dots = root.querySelectorAll('[data-dot]')
  const letters = root.querySelectorAll('[data-letter]')
  const check = root.querySelector('[data-check]')
  if (dots.length === 0 || !check) return null

  const timeline = gsap.timeline({ paused: true })

  timeline
    .set(check, { opacity: 0, scale: 0.4, x: -4 })
    .set(letters, { y: 0 })
    .fromTo(
      dots,
      // Function-based, so each dot returns to its own hue rather than all
      // three settling on the same one.
      { backgroundColor: (index: number) => DOT_COLOURS[index] ?? DOT_COLOURS[0] },
      {
        backgroundColor: MINT,
        scale: 1.4,
        duration: 0.19,
        stagger: 0.13,
        yoyo: true,
        repeat: 1,
        immediateRender: false,
      },
    )
    .to(
      letters,
      { y: -6, duration: 0.19, ease: 'sine.out', stagger: 0.02, yoyo: true, repeat: 1 },
      '-=0.52',
    )
    .to(check, { opacity: 1, scale: 1, x: 0, duration: 0.45, ease: 'back.out(3)' }, '-=0.18')
    .to(check, { opacity: 0, duration: 0.4, delay: 1.1 })

  return timeline
}

/**
 * The navbar settling into its scrolled state, or coming back out of it.
 *
 * Four independent tweens per direction rather than one reversible timeline.
 * The two directions are deliberately not mirror images: the hairline draws
 * itself in over 0.7s and retracts in half that, and the dots hop only on the
 * way in — a bounce played backwards on the way out looks like a glitch, not a
 * greeting. A reversed timeline would give all three the same curve and the
 * same length, and would start the plate fading a quarter second late because
 * the timeline is as long as its slowest tween.
 *
 * `overwrite: 'auto'` throughout: scrolling across the threshold repeatedly is
 * the normal case, not the edge case.
 */
export function setNavbarScrolled(header: HTMLElement, scrolled: boolean): void {
  if (prefersReducedMotion()) return

  const plate = header.querySelector('[data-plate]')
  const line = header.querySelector('[data-line]')
  const row = header.querySelector('[data-row]')
  const dots = header.querySelectorAll('[data-dot]')
  if (!plate || !line || !row) return

  withGsap((gsap) => {
    gsap.to(plate, {
      opacity: scrolled ? 1 : 0,
      duration: 0.45,
      ease: 'power2.out',
      overwrite: 'auto',
    })
    gsap.to(line, {
      opacity: scrolled ? 1 : 0,
      scaleX: scrolled ? 1 : 0,
      duration: scrolled ? 0.7 : 0.35,
      ease: scrolled ? 'power3.out' : 'power2.in',
      overwrite: 'auto',
    })
    gsap.to(row, {
      paddingTop: scrolled ? 13 : 24,
      paddingBottom: scrolled ? 13 : 24,
      duration: 0.45,
      ease: 'power2.out',
      overwrite: 'auto',
    })

    if (!scrolled) return
    gsap.fromTo(
      dots,
      { y: 0 },
      {
        y: -3,
        duration: 0.22,
        ease: 'sine.out',
        stagger: 0.06,
        yoyo: true,
        repeat: 1,
        immediateRender: false,
      },
    )
  })
}

/**
 * The status dot breathing under the version badge.
 *
 * The one animation on the site that never stops, so it is the one that most
 * needs the reduced-motion gate above rather than a stylesheet loop a media
 * query has to remember to switch off.
 */
export function mountBadgePulse(dot: HTMLElement): () => void {
  if (prefersReducedMotion()) return () => {}

  let tween: gsap.core.Tween | null = null
  const cancel = withGsap((gsap) => {
    tween = gsap.to(dot, {
      opacity: 0.45,
      scale: 0.82,
      // 1.2s each way, so one breath is the 2.4s the design asks for.
      duration: 1.2,
      // GSAP's nearest equivalent of the CSS `ease-in-out` in the spec.
      ease: 'power1.inOut',
      yoyo: true,
      repeat: -1,
    })
  })

  return () => {
    cancel()
    tween?.kill()
  }
}

/**
 * A nav link lifting and turning pink, with two sparkles behind it.
 *
 * `overwrite: 'auto'` on every hover pair here and below: a pointer sweeping
 * along a row of links leaves and enters faster than a 300ms tween finishes,
 * and without it the leave and the next enter both keep running and the link
 * settles on whichever finishes last.
 */
export function navLinkEnter(link: HTMLElement): void {
  if (prefersReducedMotion()) return
  withGsap((gsap) =>
    gsap.to(link, {
      color: NAV_INK_HOVER,
      y: -1,
      duration: 0.28,
      ease: 'power2.out',
      overwrite: 'auto',
    }),
  )
  sparkle(link, 2)
}

export function navLinkLeave(link: HTMLElement): void {
  if (prefersReducedMotion()) return
  withGsap((gsap) =>
    gsap.to(link, { color: NAV_INK, y: 0, duration: 0.3, ease: 'power2.out', overwrite: 'auto' }),
  )
}

/**
 * A link in the documentation header.
 *
 * Its resting colour is a theme token, so it is read off the element on the way
 * in and tweened back to on the way out — a hardcoded hex would be wrong in one
 * of the two themes. The inline colour is dropped once the leave finishes, so a
 * theme switch afterwards is picked up by the stylesheet as usual.
 */
const restingInk = new WeakMap<HTMLElement, string>()

export function docsLinkEnter(link: HTMLElement): void {
  if (prefersReducedMotion()) return
  if (!link.style.color) restingInk.set(link, getComputedStyle(link).color)
  withGsap((gsap) =>
    gsap.to(link, {
      color: NAV_INK_HOVER,
      y: -1,
      duration: 0.25,
      ease: 'power2.out',
      overwrite: 'auto',
    }),
  )
}

export function docsLinkLeave(link: HTMLElement): void {
  if (prefersReducedMotion()) return
  const resting = restingInk.get(link)
  withGsap((gsap) =>
    gsap.to(link, {
      ...(resting ? { color: resting } : {}),
      y: 0,
      duration: 0.28,
      ease: 'power2.out',
      overwrite: 'auto',
      onComplete: () => link.style.removeProperty('color'),
    }),
  )
}

/**
 * The call to action rising under the pointer, its arrow flying out to the
 * right and back in from the left.
 *
 * The flight is not a loop: it happens once per hover, so a reader who rests on
 * the button sees one flight rather than a spinning ornament.
 */
export function ctaEnter(button: HTMLElement): void {
  if (prefersReducedMotion()) return
  withGsap((gsap) => {
    gsap.to(button, { y: -2, duration: 0.25, ease: 'power2.out', overwrite: 'auto' })

    const arrow = button.querySelector('[data-arrow]')
    if (!arrow) return
    gsap
      .timeline()
      .to(arrow, { x: 18, opacity: 0, duration: 0.24, ease: 'power2.in' })
      .set(arrow, { x: -18 })
      .to(arrow, { x: 0, opacity: 1, duration: 0.42, ease: 'back.out(2.6)' })
  })
}

export function ctaLeave(button: HTMLElement): void {
  if (prefersReducedMotion()) return
  withGsap((gsap) =>
    gsap.to(button, { y: 0, duration: 0.32, ease: 'power2.out', overwrite: 'auto' }),
  )
}

/** A documentation row sliding under the pointer, with its number and arrow. */
export function docRowEnter(row: HTMLElement): void {
  if (prefersReducedMotion()) return
  const number = row.querySelector('[data-row-number]')
  const arrow = row.querySelector('[data-row-arrow]')

  withGsap((gsap) => {
    gsap.to(row, { x: 5, duration: 0.35, ease: 'power3.out', overwrite: 'auto' })
    if (number) {
      gsap.to(number, {
        scale: 1.25,
        rotate: -8,
        duration: 0.5,
        ease: 'back.out(3)',
        overwrite: 'auto',
      })
    }
    if (arrow) {
      gsap.fromTo(
        arrow,
        { x: -8, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.4, ease: 'back.out(2.6)', overwrite: 'auto' },
      )
    }
  })
}

export function docRowLeave(row: HTMLElement): void {
  if (prefersReducedMotion()) return
  const number = row.querySelector('[data-row-number]')
  const arrow = row.querySelector('[data-row-arrow]')

  withGsap((gsap) => {
    gsap.to(row, { x: 0, duration: 0.4, ease: 'power2.out', overwrite: 'auto' })
    if (number) {
      gsap.to(number, {
        scale: 1,
        rotate: 0,
        duration: 0.45,
        ease: 'power2.out',
        overwrite: 'auto',
      })
    }
    if (arrow) {
      gsap.to(arrow, { x: -8, opacity: 0, duration: 0.28, ease: 'power2.in', overwrite: 'auto' })
    }
  })
}

/**
 * The copy button acknowledging a press.
 *
 * Driven from the click, never from the clipboard promise: a denied write
 * should still look like something happened.
 *
 * One timeline covers the whole gesture including the return to rest at 1.5s,
 * rather than an acknowledgement now and a separate reset on a timer. A press
 * during the hold restarts a single sequence; two independent halves would let
 * an old timer revert a fresh press.
 *
 * `celebrate` is what separates the two places these appear: the buttons on the
 * marketing page also hop and throw sparkles, the ones in a documentation code
 * bar only swap the icon. A reader copying their way down a reference page
 * meets that button many times, and it should not throw confetti each time.
 */
const copyTimelines = new WeakMap<HTMLElement, gsap.core.Animation>()

export function acknowledgeCopy(button: HTMLElement, celebrate = false): void {
  const copy = button.querySelector('[data-icon="copy"]')
  const check = button.querySelector('[data-icon="check"]')
  if (!copy || !check) return

  withGsap((gsap) => {
    copyTimelines.get(button)?.kill()

    // Reduced motion removes the animation, not the answer. The icons still
    // swap and still come back — instantly, in one step, which is a change of
    // state rather than a movement.
    if (prefersReducedMotion()) {
      gsap.set(copy, { opacity: 0 })
      gsap.set(check, { opacity: 1, scale: 1, rotate: 0 })
      // Recorded like the timeline below, so the `kill()` above cancels it too.
      // Left unrecorded, a second press within the hold let the *first* call fire
      // and revert the icons at 1.5s while the button still reported `data-copied`
      // for another second -- withdrawing the one confirmation a reader who
      // asked for less motion gets.
      copyTimelines.set(
        button,
        gsap.delayedCall(1.5, () => {
          gsap.set(copy, { opacity: 1 })
          gsap.set(check, { opacity: 0, scale: 0.5, rotate: -25 })
        }),
      )
      return
    }

    const timeline = gsap
      .timeline()
      .to(copy, { opacity: 0, scale: 0.55, duration: 0.16, ease: 'power2.in' })
      .fromTo(
        check,
        { opacity: 0, scale: 0.5, rotate: -25 },
        { opacity: 1, scale: 1, rotate: 0, duration: 0.42, ease: 'back.out(3.4)' },
        '<',
      )
      .to(check, { opacity: 0, scale: 0.6, duration: 0.26 }, 1.5)
      .to(copy, { opacity: 1, scale: 1, duration: 0.34, ease: 'back.out(2)' }, 1.62)

    if (celebrate) {
      timeline.to(button, { y: -3, duration: 0.14, ease: 'sine.out', yoyo: true, repeat: 1 }, 0)
      sparkle(button, 2, '22%')
    }

    copyTimelines.set(button, timeline)
  })
}

/**
 * The bar that runs while Python is arriving.
 *
 * Indeterminate, because there is no honest progress to report: the download is
 * a browser fetch of a runtime, and inventing a percentage would be worse than
 * saying nothing. It says *something is happening* and roughly how fast, which
 * is what a reader waiting on six megabytes needs.
 *
 * Returns the function that stops it. Under reduced motion that is all it
 * returns -- the words carry the wait instead.
 */
export function buildBootProgress(bar: HTMLElement): () => void {
  if (prefersReducedMotion()) return () => {}

  let tween: gsap.core.Tween | null = null
  const cancel = withGsap((gsap) => {
    tween = gsap.fromTo(
      bar,
      { scaleX: 0.08, transformOrigin: 'left center' },
      {
        scaleX: 1,
        duration: 1.4,
        ease: 'power1.inOut',
        repeat: -1,
        yoyo: true,
        transformOrigin: 'left center',
      },
    )
  })

  return () => {
    cancel()
    tween?.kill()
  }
}

/**
 * The highlighter under "lovely" drawing itself, then settling.
 *
 * Two tweens, because the draw and the settle have different curves, and three
 * sparkles thrown half a second before the settle ends rather than after it --
 * they are thrown *by* the stroke landing, so they have to overlap it.
 *
 * Every axis is stated in the `fromTo`, so nothing is inferred from the resting
 * transform. See the note beside `.marker-ink` in home.css.
 */
export function mountMarker(host: HTMLElement): () => void {
  if (prefersReducedMotion()) return () => {}

  const ink = host.querySelector('[data-ink]')
  if (!ink) return () => {}

  let context: gsap.Context | null = null
  const cancel = withGsap((gsap) => {
    context = gsap.context(() => {
      gsap
        .timeline({ delay: MARKER_DELAY })
        .fromTo(
          ink,
          { scaleX: 0, scaleY: 1, rotate: -1.6, skewX: 0 },
          { scaleX: 1, duration: 0.8, ease: 'power3.out' },
        )
        .to(ink, { rotate: 0, duration: 0.7, ease: 'elastic.out(1, 0.5)' }, '-=0.35')
        .add(() => sparkle(host, 3, '-6%'), '-=0.5')
    }, host)
  })

  return () => {
    cancel()
    context?.revert()
  }
}

/** The highlighter starts drawing once the page has settled. */
const MARKER_DELAY = 0.55

/** How long a tilt holds off the next one. */
const TILT_LOCK_MS = 520

let tiltLocked = false

/**
 * The same stroke nudged on hover.
 *
 * Released well before the settle finishes: an elastic tail is still visibly
 * moving long after the gesture reads as over, and locking for the whole 1.09s
 * makes a second hover feel ignored.
 */
export function tiltMarker(host: HTMLElement): void {
  if (tiltLocked || prefersReducedMotion()) return

  const ink = host.querySelector('[data-ink]')
  if (!ink) return

  tiltLocked = true
  withGsap((gsap) => {
    gsap
      .timeline()
      .to(ink, { rotate: 1.3, scaleY: 1.07, duration: 0.24, ease: 'sine.out' })
      .to(ink, { rotate: 0, scaleY: 1, duration: 0.85, ease: 'elastic.out(1, 0.42)' })
  })
  sparkle(host, 2, '-4%')

  window.setTimeout(() => {
    tiltLocked = false
  }, TILT_LOCK_MS)
}
