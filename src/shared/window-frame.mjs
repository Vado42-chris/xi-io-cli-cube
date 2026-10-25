import * as e from "react";
import t, { Component as n, Fragment as r, createContext as i, createElement as a, forwardRef as o, useCallback as s, useContext as c, useEffect as l, useId as u, useInsertionEffect as d, useLayoutEffect as f, useMemo as p, useRef as m, useState as h, useSyncExternalStore as g } from "react";
import { Fragment as _, jsx as v, jsxs as y } from "react/jsx-runtime";
import b, * as x from "react-dom";
// \0rolldown/runtime.js
var S = Object.defineProperty, C = Object.getOwnPropertyDescriptor, w = Object.getOwnPropertyNames, T = Object.prototype.hasOwnProperty, E = (e, t, n) => () => {
	if (n) throw n[0];
	try {
		return e && (t = e(e = 0)), t;
	} catch (e) {
		throw n = [e], e;
	}
}, ee = (e, t) => () => (t || (e((t = { exports: {} }).exports, t, t.exports), e = null), t.exports), D = (e, t) => {
	let n = {};
	for (var r in e) S(n, r, {
		get: e[r],
		enumerable: !0
	});
	return t || S(n, Symbol.toStringTag, { value: "Module" }), n;
}, te = (e, t, n, r) => {
	if (t && typeof t == "object" || typeof t == "function") for (var i = w(t), a = 0, o = i.length, s; a < o; a++) s = i[a], !T.call(e, s) && s !== n && S(e, s, {
		get: ((e) => t[e]).bind(null, s),
		enumerable: !(r = C(t, s)) || r.enumerable
	});
	return e;
}, O = (e) => T.call(e, "module.exports") ? e["module.exports"] : te(S({}, "__esModule", { value: !0 }), e), k = i(null);
// ../build-deps/node_modules/framer-motion/dist/es/utils/use-constant.mjs
function A(e) {
	let t = m(null);
	return t.current === null && (t.current = e()), t.current;
}
// ../build-deps/node_modules/framer-motion/dist/es/context/MotionConfigContext.mjs
var j = i({
	transformPagePoint: (e) => e,
	isStatic: !1,
	reducedMotion: "never"
}), M = i({}), N = /* @__NO_SIDE_EFFECTS__ */ (e) => e, P = N, ne = N;
process.env.NODE_ENV !== "production" && (P = (e, t) => {
	!e && typeof console < "u" && console.warn(t);
}, ne = (e, t) => {
	if (!e) throw Error(t);
});
// ../build-deps/node_modules/motion-utils/dist/es/memo.mjs
/*#__NO_SIDE_EFFECTS__*/
function re(e) {
	let t;
	return () => (t === void 0 && (t = e()), t);
}
// ../build-deps/node_modules/motion-utils/dist/es/progress.mjs
var F = /* @__NO_SIDE_EFFECTS__ */ (e, t, n) => {
	let r = t - e;
	return r === 0 ? 1 : (n - e) / r;
}, I = /* @__NO_SIDE_EFFECTS__ */ (e) => e * 1e3, L = /* @__NO_SIDE_EFFECTS__ */ (e) => e / 1e3, ie = typeof window < "u", R = ie ? f : l, z = {
	skipAnimations: !1,
	useManualTiming: !1
};
// ../build-deps/node_modules/framer-motion/dist/es/frameloop/render-step.mjs
function ae(e) {
	let t = /* @__PURE__ */ new Set(), n = /* @__PURE__ */ new Set(), r = !1, i = !1, a = /* @__PURE__ */ new WeakSet(), o = {
		delta: 0,
		timestamp: 0,
		isProcessing: !1
	};
	function s(t) {
		a.has(t) && (c.schedule(t), e()), t(o);
	}
	let c = {
		schedule: (e, i = !1, o = !1) => {
			let s = o && r ? t : n;
			return i && a.add(e), s.has(e) || s.add(e), e;
		},
		cancel: (e) => {
			n.delete(e), a.delete(e);
		},
		process: (e) => {
			o = e, r ? i = !0 : (r = !0, [t, n] = [n, t], t.forEach(s), t.clear(), r = !1, i && (i = !1, c.process(e)));
		}
	};
	return c;
}
// ../build-deps/node_modules/framer-motion/dist/es/frameloop/batcher.mjs
var oe = [
	"read",
	"resolveKeyframes",
	"update",
	"preRender",
	"render",
	"postRender"
], se = 40;
function ce(e, t) {
	let n = !1, r = !0, i = {
		delta: 0,
		timestamp: 0,
		isProcessing: !1
	}, a = () => n = !0, o = oe.reduce((e, t) => (e[t] = ae(a), e), {}), { read: s, resolveKeyframes: c, update: l, preRender: u, render: d, postRender: f } = o, p = () => {
		let a = z.useManualTiming ? i.timestamp : performance.now();
		n = !1, i.delta = r ? 1e3 / 60 : Math.max(Math.min(a - i.timestamp, se), 1), i.timestamp = a, i.isProcessing = !0, s.process(i), c.process(i), l.process(i), u.process(i), d.process(i), f.process(i), i.isProcessing = !1, n && t && (r = !1, e(p));
	}, m = () => {
		n = !0, r = !0, i.isProcessing || e(p);
	};
	return {
		schedule: oe.reduce((e, t) => {
			let r = o[t];
			return e[t] = (e, t = !1, i = !1) => (n || m(), r.schedule(e, t, i)), e;
		}, {}),
		cancel: (e) => {
			for (let t = 0; t < oe.length; t++) o[oe[t]].cancel(e);
		},
		state: i,
		steps: o
	};
}
// ../build-deps/node_modules/framer-motion/dist/es/frameloop/frame.mjs
var { schedule: B, cancel: V, state: H, steps: le } = ce(typeof requestAnimationFrame < "u" ? requestAnimationFrame : N, !0), ue = i({ strict: !1 }), de = {
	animation: [
		"animate",
		"variants",
		"whileHover",
		"whileTap",
		"exit",
		"whileInView",
		"whileFocus",
		"whileDrag"
	],
	exit: ["exit"],
	drag: ["drag", "dragControls"],
	focus: ["whileFocus"],
	hover: [
		"whileHover",
		"onHoverStart",
		"onHoverEnd"
	],
	tap: [
		"whileTap",
		"onTap",
		"onTapStart",
		"onTapCancel"
	],
	pan: [
		"onPan",
		"onPanStart",
		"onPanSessionStart",
		"onPanEnd"
	],
	inView: [
		"whileInView",
		"onViewportEnter",
		"onViewportLeave"
	],
	layout: ["layout", "layoutId"]
}, fe = {};
for (let e in de) fe[e] = { isEnabled: (t) => de[e].some((e) => !!t[e]) };
// ../build-deps/node_modules/framer-motion/dist/es/motion/features/load-features.mjs
function U(e) {
	for (let t in e) fe[t] = {
		...fe[t],
		...e[t]
	};
}
// ../build-deps/node_modules/framer-motion/dist/es/motion/utils/valid-prop.mjs
var pe = /* @__PURE__ */ new Set(/* @__PURE__ */ "animate.exit.variants.initial.style.values.variants.transition.transformTemplate.custom.inherit.onBeforeLayoutMeasure.onAnimationStart.onAnimationComplete.onUpdate.onDragStart.onDrag.onDragEnd.onMeasureDragConstraints.onDirectionLock.onDragTransitionEnd._dragX._dragY.onHoverStart.onHoverEnd.onViewportEnter.onViewportLeave.globalTapTarget.ignoreStrict.viewport".split("."));
function me(e) {
	return e.startsWith("while") || e.startsWith("drag") && e !== "draggable" || e.startsWith("layout") || e.startsWith("onTap") || e.startsWith("onPan") || e.startsWith("onLayout") || pe.has(e);
}
// __vite-optional-peer-dep:@emotion/is-prop-valid:framer-motion
var he = /* @__PURE__ */ D({ default: () => ge }), ge, W = E((() => {
	throw ge = {}, Error("Could not resolve \"@emotion/is-prop-valid\" imported by \"framer-motion\". Is it installed?");
})), G = (e) => !me(e);
function _e(e) {
	e && (G = (t) => t.startsWith("on") ? !me(t) : e(t));
}
try {
	_e((W(), O(he)).default);
} catch {}
function K(e, t, n) {
	let r = {};
	for (let i in e) (i !== "values" || typeof e.values != "object") && (G(i) || n === !0 && me(i) || !t && !me(i) || e.draggable && i.startsWith("onDrag")) && (r[i] = e[i]);
	return r;
}
// ../build-deps/node_modules/framer-motion/dist/es/utils/warn-once.mjs
var q = /* @__PURE__ */ new Set();
function ve(e, t, n) {
	e || q.has(t) || (console.warn(t), n && console.warn(n), q.add(t));
}
// ../build-deps/node_modules/framer-motion/dist/es/render/components/create-proxy.mjs
function ye(e) {
	if (typeof Proxy > "u") return e;
	let t = /* @__PURE__ */ new Map();
	return new Proxy((...t) => (process.env.NODE_ENV !== "production" && ve(!1, "motion() is deprecated. Use motion.create() instead."), e(...t)), { get: (n, r) => r === "create" ? e : (t.has(r) || t.set(r, e(r)), t.get(r)) });
}
// ../build-deps/node_modules/framer-motion/dist/es/context/MotionContext/index.mjs
var be = i({});
// ../build-deps/node_modules/framer-motion/dist/es/render/utils/is-variant-label.mjs
function xe(e) {
	return typeof e == "string" || Array.isArray(e);
}
// ../build-deps/node_modules/framer-motion/dist/es/animation/utils/is-animation-controls.mjs
function Se(e) {
	return typeof e == "object" && !!e && typeof e.start == "function";
}
// ../build-deps/node_modules/framer-motion/dist/es/render/utils/variant-props.mjs
var Ce = [
	"animate",
	"whileInView",
	"whileFocus",
	"whileHover",
	"whileTap",
	"whileDrag",
	"exit"
], we = ["initial", ...Ce];
// ../build-deps/node_modules/framer-motion/dist/es/render/utils/is-controlling-variants.mjs
function Te(e) {
	return Se(e.animate) || we.some((t) => xe(e[t]));
}
function Ee(e) {
	return !!(Te(e) || e.variants);
}
// ../build-deps/node_modules/framer-motion/dist/es/context/MotionContext/utils.mjs
function De(e, t) {
	if (Te(e)) {
		let { initial: t, animate: n } = e;
		return {
			initial: t === !1 || xe(t) ? t : void 0,
			animate: xe(n) ? n : void 0
		};
	}
	return e.inherit === !1 ? {} : t;
}
// ../build-deps/node_modules/framer-motion/dist/es/context/MotionContext/create.mjs
function Oe(e) {
	let { initial: t, animate: n } = De(e, c(be));
	return p(() => ({
		initial: t,
		animate: n
	}), [ke(t), ke(n)]);
}
function ke(e) {
	return Array.isArray(e) ? e.join(" ") : e;
}
// ../build-deps/node_modules/framer-motion/dist/es/motion/utils/symbol.mjs
var Ae = Symbol.for("motionComponentSymbol");
// ../build-deps/node_modules/framer-motion/dist/es/utils/is-ref-object.mjs
function je(e) {
	return e && typeof e == "object" && Object.prototype.hasOwnProperty.call(e, "current");
}
// ../build-deps/node_modules/framer-motion/dist/es/motion/utils/use-motion-ref.mjs
function Me(e, t, n) {
	return s((r) => {
		r && e.mount && e.mount(r), t && (r ? t.mount(r) : t.unmount()), n && (typeof n == "function" ? n(r) : je(n) && (n.current = r));
	}, [t]);
}
// ../build-deps/node_modules/framer-motion/dist/es/render/dom/utils/camel-to-dash.mjs
var Ne = (e) => e.replace(/([a-z])([A-Z])/gu, "$1-$2").toLowerCase(), Pe = "data-" + Ne("framerAppearId"), { schedule: Fe, cancel: Ie } = ce(queueMicrotask, !1), Le = i({});
// ../build-deps/node_modules/framer-motion/dist/es/motion/utils/use-visual-element.mjs
function Re(e, t, n, r, i) {
	let { visualElement: a } = c(be), o = c(ue), s = c(k), u = c(j).reducedMotion, f = m(null);
	r ||= o.renderer, !f.current && r && (f.current = r(e, {
		visualState: t,
		parent: a,
		props: n,
		presenceContext: s,
		blockInitialAnimation: s ? s.initial === !1 : !1,
		reducedMotionConfig: u
	}));
	let p = f.current, h = c(Le);
	p && !p.projection && i && (p.type === "html" || p.type === "svg") && ze(f.current, n, i, h);
	let g = m(!1);
	d(() => {
		p && g.current && p.update(n, s);
	});
	let _ = n[Pe], v = m(!!_ && !window.MotionHandoffIsComplete?.call(window, _) && window.MotionHasOptimisedAnimation?.call(window, _));
	return R(() => {
		p && (g.current = !0, window.MotionIsMounted = !0, p.updateFeatures(), Fe.render(p.render), v.current && p.animationState && p.animationState.animateChanges());
	}), l(() => {
		p && (!v.current && p.animationState && p.animationState.animateChanges(), v.current &&= (queueMicrotask(() => {
			var e;
			(e = window.MotionHandoffMarkAsComplete) == null || e.call(window, _);
		}), !1));
	}), p;
}
function ze(e, t, n, r) {
	let { layoutId: i, layout: a, drag: o, dragConstraints: s, layoutScroll: c, layoutRoot: l } = t;
	e.projection = new n(e.latestValues, t["data-framer-portal-id"] ? void 0 : Be(e.parent)), e.projection.setOptions({
		layoutId: i,
		layout: a,
		alwaysMeasureLayout: !!o || s && je(s),
		visualElement: e,
		animationType: typeof a == "string" ? a : "both",
		initialPromotionConfig: r,
		layoutScroll: c,
		layoutRoot: l
	});
}
function Be(e) {
	if (e) return e.options.allowProjection === !1 ? Be(e.parent) : e.projection;
}
// ../build-deps/node_modules/framer-motion/dist/es/motion/index.mjs
function Ve({ preloadedFeatures: e, createVisualElement: t, useRender: n, useVisualState: r, Component: i }) {
	e && U(e);
	function a(a, o) {
		let s, l = {
			...c(j),
			...a,
			layoutId: He(a)
		}, { isStatic: u } = l, d = Oe(a), f = r(a, u);
		if (!u && ie) {
			Ue(l, e);
			let n = We(l);
			s = n.MeasureLayout, d.visualElement = Re(i, f, l, t, n.ProjectionNode);
		}
		return y(be.Provider, {
			value: d,
			children: [s && d.visualElement ? v(s, {
				visualElement: d.visualElement,
				...l
			}) : null, n(i, a, Me(f, d.visualElement, o), f, u, d.visualElement)]
		});
	}
	a.displayName = `motion.${typeof i == "string" ? i : `create(${i.displayName ?? i.name ?? ""})`}`;
	let s = o(a);
	return s[Ae] = i, s;
}
function He({ layoutId: e }) {
	let t = c(M).id;
	return t && e !== void 0 ? t + "-" + e : e;
}
function Ue(e, t) {
	let n = c(ue).strict;
	if (process.env.NODE_ENV !== "production" && t && n) {
		let t = "You have rendered a `motion` component within a `LazyMotion` component. This will break tree shaking. Import and render a `m` component instead.";
		e.ignoreStrict ? P(!1, t) : ne(!1, t);
	}
}
function We(e) {
	let { drag: t, layout: n } = fe;
	if (!t && !n) return {};
	let r = {
		...t,
		...n
	};
	return {
		MeasureLayout: t?.isEnabled(e) || n?.isEnabled(e) ? r.MeasureLayout : void 0,
		ProjectionNode: r.ProjectionNode
	};
}
// ../build-deps/node_modules/framer-motion/dist/es/render/svg/lowercase-elements.mjs
var Ge = [
	"animate",
	"circle",
	"defs",
	"desc",
	"ellipse",
	"g",
	"image",
	"line",
	"filter",
	"marker",
	"mask",
	"metadata",
	"path",
	"pattern",
	"polygon",
	"polyline",
	"rect",
	"stop",
	"switch",
	"symbol",
	"svg",
	"text",
	"tspan",
	"use",
	"view"
];
// ../build-deps/node_modules/framer-motion/dist/es/render/dom/utils/is-svg-component.mjs
function Ke(e) {
	return typeof e != "string" || e.includes("-") ? !1 : !!(Ge.indexOf(e) > -1 || /[A-Z]/u.test(e));
}
// ../build-deps/node_modules/framer-motion/dist/es/render/html/utils/render.mjs
function qe(e, { style: t, vars: n }, r, i) {
	Object.assign(e.style, t, i && i.getProjectionStyles(r));
	for (let t in n) e.style.setProperty(t, n[t]);
}
// ../build-deps/node_modules/framer-motion/dist/es/render/svg/utils/camel-case-attrs.mjs
var Je = /* @__PURE__ */ new Set([
	"baseFrequency",
	"diffuseConstant",
	"kernelMatrix",
	"kernelUnitLength",
	"keySplines",
	"keyTimes",
	"limitingConeAngle",
	"markerHeight",
	"markerWidth",
	"numOctaves",
	"targetX",
	"targetY",
	"surfaceScale",
	"specularConstant",
	"specularExponent",
	"stdDeviation",
	"tableValues",
	"viewBox",
	"gradientTransform",
	"pathLength",
	"startOffset",
	"textLength",
	"lengthAdjust"
]);
// ../build-deps/node_modules/framer-motion/dist/es/render/svg/utils/render.mjs
function Ye(e, t, n, r) {
	qe(e, t, void 0, r);
	for (let n in t.attrs) e.setAttribute(Je.has(n) ? n : Ne(n), t.attrs[n]);
}
// ../build-deps/node_modules/framer-motion/dist/es/value/utils/is-motion-value.mjs
var Xe = (e) => !!(e && e.getVelocity), Ze = {};
function Qe(e) {
	Object.assign(Ze, e);
}
// ../build-deps/node_modules/framer-motion/dist/es/render/html/utils/transform.mjs
var $e = [
	"transformPerspective",
	"x",
	"y",
	"z",
	"translateX",
	"translateY",
	"translateZ",
	"scale",
	"scaleX",
	"scaleY",
	"rotate",
	"rotateX",
	"rotateY",
	"rotateZ",
	"skew",
	"skewX",
	"skewY"
], et = new Set($e);
// ../build-deps/node_modules/framer-motion/dist/es/motion/utils/is-forced-motion-value.mjs
function tt(e, { layout: t, layoutId: n }) {
	return et.has(e) || e.startsWith("origin") || (t || n !== void 0) && (!!Ze[e] || e === "opacity");
}
// ../build-deps/node_modules/framer-motion/dist/es/render/html/utils/scrape-motion-values.mjs
function nt(e, t, n) {
	let { style: r } = e, i = {};
	for (let a in r) (Xe(r[a]) || t.style && Xe(t.style[a]) || tt(a, e) || n?.getValue(a)?.liveStyle !== void 0) && (i[a] = r[a]);
	return i;
}
// ../build-deps/node_modules/framer-motion/dist/es/render/svg/utils/scrape-motion-values.mjs
function rt(e, t, n) {
	let r = nt(e, t, n);
	for (let n in e) if (Xe(e[n]) || Xe(t[n])) {
		let t = $e.indexOf(n) === -1 ? n : "attr" + n.charAt(0).toUpperCase() + n.substring(1);
		r[t] = e[n];
	}
	return r;
}
// ../build-deps/node_modules/framer-motion/dist/es/render/utils/resolve-variants.mjs
function it(e) {
	let t = [{}, {}];
	return e?.values.forEach((e, n) => {
		t[0][n] = e.get(), t[1][n] = e.getVelocity();
	}), t;
}
function at(e, t, n, r) {
	if (typeof t == "function") {
		let [i, a] = it(r);
		t = t(n === void 0 ? e.custom : n, i, a);
	}
	if (typeof t == "string" && (t = e.variants && e.variants[t]), typeof t == "function") {
		let [i, a] = it(r);
		t = t(n === void 0 ? e.custom : n, i, a);
	}
	return t;
}
// ../build-deps/node_modules/framer-motion/dist/es/animation/utils/is-keyframes-target.mjs
var ot = (e) => Array.isArray(e), st = (e) => !!(e && typeof e == "object" && e.mix && e.toValue), ct = (e) => ot(e) ? e[e.length - 1] || 0 : e;
// ../build-deps/node_modules/framer-motion/dist/es/value/utils/resolve-motion-value.mjs
function lt(e) {
	let t = Xe(e) ? e.get() : e;
	return st(t) ? t.toValue() : t;
}
// ../build-deps/node_modules/framer-motion/dist/es/motion/utils/use-visual-state.mjs
function ut({ scrapeMotionValuesFromProps: e, createRenderState: t, onMount: n }, r, i, a) {
	let o = {
		latestValues: ft(r, i, a, e),
		renderState: t()
	};
	return n && (o.mount = (e) => n(r, e, o)), o;
}
var dt = (e) => (t, n) => {
	let r = c(be), i = c(k), a = () => ut(e, t, r, i);
	return n ? a() : A(a);
};
function ft(e, t, n, r) {
	let i = {}, a = r(e, {});
	for (let e in a) i[e] = lt(a[e]);
	let { initial: o, animate: s } = e, c = Te(e), l = Ee(e);
	t && l && !c && e.inherit !== !1 && (o === void 0 && (o = t.initial), s === void 0 && (s = t.animate));
	let u = n ? n.initial === !1 : !1;
	u ||= o === !1;
	let d = u ? s : o;
	if (d && typeof d != "boolean" && !Se(d)) {
		let t = Array.isArray(d) ? d : [d];
		for (let n = 0; n < t.length; n++) {
			let r = at(e, t[n]);
			if (r) {
				let { transitionEnd: e, transition: t, ...n } = r;
				for (let e in n) {
					let t = n[e];
					if (Array.isArray(t)) {
						let e = u ? t.length - 1 : 0;
						t = t[e];
					}
					t !== null && (i[e] = t);
				}
				for (let t in e) i[t] = e[t];
			}
		}
	}
	return i;
}
// ../build-deps/node_modules/framer-motion/dist/es/render/html/utils/create-render-state.mjs
var pt = () => ({
	style: {},
	transform: {},
	transformOrigin: {},
	vars: {}
}), mt = () => ({
	...pt(),
	attrs: {}
}), ht = (e, t) => t && typeof e == "number" ? t.transform(e) : e, gt = (e, t, n) => n > t ? t : n < e ? e : n, _t = {
	test: (e) => typeof e == "number",
	parse: parseFloat,
	transform: (e) => e
}, vt = {
	..._t,
	transform: (e) => gt(0, 1, e)
}, yt = {
	..._t,
	default: 1
}, bt = (e) => ({
	test: (t) => typeof t == "string" && t.endsWith(e) && t.split(" ").length === 1,
	parse: parseFloat,
	transform: (t) => `${t}${e}`
}), xt = /*@__PURE__*/ bt("deg"), St = /*@__PURE__*/ bt("%"), J = /*@__PURE__*/ bt("px"), Ct = /*@__PURE__*/ bt("vh"), wt = /*@__PURE__*/ bt("vw"), Tt = {
	...St,
	parse: (e) => St.parse(e) / 100,
	transform: (e) => St.transform(e * 100)
}, Et = {
	borderWidth: J,
	borderTopWidth: J,
	borderRightWidth: J,
	borderBottomWidth: J,
	borderLeftWidth: J,
	borderRadius: J,
	radius: J,
	borderTopLeftRadius: J,
	borderTopRightRadius: J,
	borderBottomRightRadius: J,
	borderBottomLeftRadius: J,
	width: J,
	maxWidth: J,
	height: J,
	maxHeight: J,
	top: J,
	right: J,
	bottom: J,
	left: J,
	padding: J,
	paddingTop: J,
	paddingRight: J,
	paddingBottom: J,
	paddingLeft: J,
	margin: J,
	marginTop: J,
	marginRight: J,
	marginBottom: J,
	marginLeft: J,
	backgroundPositionX: J,
	backgroundPositionY: J
}, Dt = {
	rotate: xt,
	rotateX: xt,
	rotateY: xt,
	rotateZ: xt,
	scale: yt,
	scaleX: yt,
	scaleY: yt,
	scaleZ: yt,
	skew: xt,
	skewX: xt,
	skewY: xt,
	distance: J,
	translateX: J,
	translateY: J,
	translateZ: J,
	x: J,
	y: J,
	z: J,
	perspective: J,
	transformPerspective: J,
	opacity: vt,
	originX: Tt,
	originY: Tt,
	originZ: J
}, Ot = {
	..._t,
	transform: Math.round
}, kt = {
	...Et,
	...Dt,
	zIndex: Ot,
	size: J,
	fillOpacity: vt,
	strokeOpacity: vt,
	numOctaves: Ot
}, At = {
	x: "translateX",
	y: "translateY",
	z: "translateZ",
	transformPerspective: "perspective"
}, jt = $e.length;
function Mt(e, t, n) {
	let r = "", i = !0;
	for (let a = 0; a < jt; a++) {
		let o = $e[a], s = e[o];
		if (s === void 0) continue;
		let c = !0;
		if (c = typeof s == "number" ? s === +!!o.startsWith("scale") : parseFloat(s) === 0, !c || n) {
			let e = ht(s, kt[o]);
			if (!c) {
				i = !1;
				let t = At[o] || o;
				r += `${t}(${e}) `;
			}
			n && (t[o] = e);
		}
	}
	return r = r.trim(), n ? r = n(t, i ? "" : r) : i && (r = "none"), r;
}
// ../build-deps/node_modules/framer-motion/dist/es/render/dom/utils/is-css-variable.mjs
var Nt = (e) => (t) => typeof t == "string" && t.startsWith(e), Pt = /*@__PURE__*/ Nt("--"), Ft = /*@__PURE__*/ Nt("var(--"), It = (e) => Ft(e) ? Lt.test(e.split("/*")[0].trim()) : !1, Lt = /var\(--(?:[\w-]+\s*|[\w-]+\s*,(?:\s*[^)(\s]|\s*\((?:[^)(]|\([^)(]*\))*\))+\s*)\)$/iu;
// ../build-deps/node_modules/framer-motion/dist/es/render/html/utils/build-styles.mjs
function Rt(e, t, n) {
	let { style: r, vars: i, transformOrigin: a } = e, o = !1, s = !1;
	for (let e in t) {
		let n = t[e];
		if (et.has(e)) o = !0;
		else if (Pt(e)) i[e] = n;
		else {
			let t = ht(n, kt[e]);
			e.startsWith("origin") ? (s = !0, a[e] = t) : r[e] = t;
		}
	}
	if (t.transform || (o || n ? r.transform = Mt(t, e.transform, n) : r.transform &&= "none"), s) {
		let { originX: e = "50%", originY: t = "50%", originZ: n = 0 } = a;
		r.transformOrigin = `${e} ${t} ${n}`;
	}
}
// ../build-deps/node_modules/framer-motion/dist/es/render/svg/utils/transform-origin.mjs
function zt(e, t, n) {
	return typeof e == "string" ? e : J.transform(t + n * e);
}
function Bt(e, t, n) {
	return `${zt(t, e.x, e.width)} ${zt(n, e.y, e.height)}`;
}
// ../build-deps/node_modules/framer-motion/dist/es/render/svg/utils/path.mjs
var Vt = {
	offset: "stroke-dashoffset",
	array: "stroke-dasharray"
}, Ht = {
	offset: "strokeDashoffset",
	array: "strokeDasharray"
};
function Ut(e, t, n = 1, r = 0, i = !0) {
	e.pathLength = 1;
	let a = i ? Vt : Ht;
	e[a.offset] = J.transform(-r);
	let o = J.transform(t), s = J.transform(n);
	e[a.array] = `${o} ${s}`;
}
// ../build-deps/node_modules/framer-motion/dist/es/render/svg/utils/build-attrs.mjs
function Wt(e, { attrX: t, attrY: n, attrScale: r, originX: i, originY: a, pathLength: o, pathSpacing: s = 1, pathOffset: c = 0, ...l }, u, d) {
	if (Rt(e, l, d), u) {
		e.style.viewBox && (e.attrs.viewBox = e.style.viewBox);
		return;
	}
	e.attrs = e.style, e.style = {};
	let { attrs: f, style: p, dimensions: m } = e;
	f.transform && (m && (p.transform = f.transform), delete f.transform), m && (i !== void 0 || a !== void 0 || p.transform) && (p.transformOrigin = Bt(m, i === void 0 ? .5 : i, a === void 0 ? .5 : a)), t !== void 0 && (f.x = t), n !== void 0 && (f.y = n), r !== void 0 && (f.scale = r), o !== void 0 && Ut(f, o, s, c, !1);
}
// ../build-deps/node_modules/framer-motion/dist/es/render/svg/utils/is-svg-tag.mjs
var Gt = (e) => typeof e == "string" && e.toLowerCase() === "svg", Kt = { useVisualState: dt({
	scrapeMotionValuesFromProps: rt,
	createRenderState: mt,
	onMount: (e, t, { renderState: n, latestValues: r }) => {
		B.read(() => {
			try {
				n.dimensions = typeof t.getBBox == "function" ? t.getBBox() : t.getBoundingClientRect();
			} catch {
				n.dimensions = {
					x: 0,
					y: 0,
					width: 0,
					height: 0
				};
			}
		}), B.render(() => {
			Wt(n, r, Gt(t.tagName), e.transformTemplate), Ye(t, n);
		});
	}
}) }, qt = { useVisualState: dt({
	scrapeMotionValuesFromProps: nt,
	createRenderState: pt
}) };
// ../build-deps/node_modules/framer-motion/dist/es/render/html/use-props.mjs
function Jt(e, t, n) {
	for (let r in t) !Xe(t[r]) && !tt(r, n) && (e[r] = t[r]);
}
function Yt({ transformTemplate: e }, t) {
	return p(() => {
		let n = pt();
		return Rt(n, t, e), Object.assign({}, n.vars, n.style);
	}, [t]);
}
function Xt(e, t) {
	let n = e.style || {}, r = {};
	return Jt(r, n, e), Object.assign(r, Yt(e, t)), r;
}
function Zt(e, t) {
	let n = {}, r = Xt(e, t);
	return e.drag && e.dragListener !== !1 && (n.draggable = !1, r.userSelect = r.WebkitUserSelect = r.WebkitTouchCallout = "none", r.touchAction = e.drag === !0 ? "none" : `pan-${e.drag === "x" ? "y" : "x"}`), e.tabIndex === void 0 && (e.onTap || e.onTapStart || e.whileTap) && (n.tabIndex = 0), n.style = r, n;
}
// ../build-deps/node_modules/framer-motion/dist/es/render/svg/use-props.mjs
function Qt(e, t, n, r) {
	let i = p(() => {
		let n = mt();
		return Wt(n, t, Gt(r), e.transformTemplate), {
			...n.attrs,
			style: { ...n.style }
		};
	}, [t]);
	if (e.style) {
		let t = {};
		Jt(t, e.style, e), i.style = {
			...t,
			...i.style
		};
	}
	return i;
}
// ../build-deps/node_modules/framer-motion/dist/es/render/dom/use-render.mjs
function $t(e = !1) {
	return (t, n, i, { latestValues: o }, s) => {
		let c = (Ke(t) ? Qt : Zt)(n, o, s, t), l = K(n, typeof t == "string", e), u = t === r ? {} : {
			...l,
			...c,
			ref: i
		}, { children: d } = n, f = p(() => Xe(d) ? d.get() : d, [d]);
		return a(t, {
			...u,
			children: f
		});
	};
}
// ../build-deps/node_modules/framer-motion/dist/es/render/components/create-factory.mjs
function en(e, t) {
	return function(n, { forwardMotionProps: r } = { forwardMotionProps: !1 }) {
		return Ve({
			...Ke(n) ? Kt : qt,
			preloadedFeatures: e,
			useRender: $t(r),
			createVisualElement: t,
			Component: n
		});
	};
}
// ../build-deps/node_modules/framer-motion/dist/es/utils/shallow-compare.mjs
function tn(e, t) {
	if (!Array.isArray(t)) return !1;
	let n = t.length;
	if (n !== e.length) return !1;
	for (let r = 0; r < n; r++) if (t[r] !== e[r]) return !1;
	return !0;
}
// ../build-deps/node_modules/framer-motion/dist/es/render/utils/resolve-dynamic-variants.mjs
function nn(e, t, n) {
	let r = e.getProps();
	return at(r, t, n === void 0 ? r.custom : n, e);
}
// ../build-deps/node_modules/motion-dom/dist/es/utils/supports/scroll-timeline.mjs
var rn = /* @__PURE__ */ re(() => window.ScrollTimeline !== void 0), an = class {
	constructor(e) {
		this.stop = () => this.runAll("stop"), this.animations = e.filter(Boolean);
	}
	get finished() {
		return Promise.all(this.animations.map((e) => "finished" in e ? e.finished : e));
	}
	getAll(e) {
		return this.animations[0][e];
	}
	setAll(e, t) {
		for (let n = 0; n < this.animations.length; n++) this.animations[n][e] = t;
	}
	attachTimeline(e, t) {
		let n = this.animations.map((n) => {
			if (rn() && n.attachTimeline) return n.attachTimeline(e);
			if (typeof t == "function") return t(n);
		});
		return () => {
			n.forEach((e, t) => {
				e && e(), this.animations[t].stop();
			});
		};
	}
	get time() {
		return this.getAll("time");
	}
	set time(e) {
		this.setAll("time", e);
	}
	get speed() {
		return this.getAll("speed");
	}
	set speed(e) {
		this.setAll("speed", e);
	}
	get startTime() {
		return this.getAll("startTime");
	}
	get duration() {
		let e = 0;
		for (let t = 0; t < this.animations.length; t++) e = Math.max(e, this.animations[t].duration);
		return e;
	}
	runAll(e) {
		this.animations.forEach((t) => t[e]());
	}
	flatten() {
		this.runAll("flatten");
	}
	play() {
		this.runAll("play");
	}
	pause() {
		this.runAll("pause");
	}
	cancel() {
		this.runAll("cancel");
	}
	complete() {
		this.runAll("complete");
	}
}, on = class extends an {
	then(e, t) {
		return Promise.all(this.animations).then(e).catch(t);
	}
};
// ../build-deps/node_modules/motion-dom/dist/es/animation/utils/get-value-transition.mjs
function sn(e, t) {
	return e ? e[t] || e.default || e : void 0;
}
// ../build-deps/node_modules/motion-dom/dist/es/animation/generators/utils/calc-duration.mjs
var cn = 2e4;
function ln(e) {
	let t = 0, n = e.next(t);
	for (; !n.done && t < 2e4;) t += 50, n = e.next(t);
	return t >= 2e4 ? Infinity : t;
}
// ../build-deps/node_modules/motion-dom/dist/es/animation/generators/utils/is-generator.mjs
function un(e) {
	return typeof e == "function";
}
// ../build-deps/node_modules/motion-dom/dist/es/animation/waapi/utils/attach-timeline.mjs
function dn(e, t) {
	e.timeline = t, e.onfinish = null;
}
// ../build-deps/node_modules/motion-dom/dist/es/utils/is-bezier-definition.mjs
var fn = (e) => Array.isArray(e) && typeof e[0] == "number", pn = { linearEasing: void 0 };
// ../build-deps/node_modules/motion-dom/dist/es/utils/supports/memo.mjs
function mn(e, t) {
	let n = /* @__PURE__ */ re(e);
	return () => pn[t] ?? n();
}
// ../build-deps/node_modules/motion-dom/dist/es/utils/supports/linear-easing.mjs
var hn = /*@__PURE__*/ mn(() => {
	try {
		document.createElement("div").animate({ opacity: 0 }, { easing: "linear(0, 1)" });
	} catch {
		return !1;
	}
	return !0;
}, "linearEasing"), gn = (e, t, n = 10) => {
	let r = "", i = Math.max(Math.round(t / n), 2);
	for (let t = 0; t < i; t++) r += e(/* @__PURE__ */ F(0, i - 1, t)) + ", ";
	return `linear(${r.substring(0, r.length - 2)})`;
};
// ../build-deps/node_modules/motion-dom/dist/es/animation/waapi/utils/easing.mjs
function _n(e) {
	return !!(typeof e == "function" && hn() || !e || typeof e == "string" && (e in yn || hn()) || fn(e) || Array.isArray(e) && e.every(_n));
}
var vn = ([e, t, n, r]) => `cubic-bezier(${e}, ${t}, ${n}, ${r})`, yn = {
	linear: "linear",
	ease: "ease",
	easeIn: "ease-in",
	easeOut: "ease-out",
	easeInOut: "ease-in-out",
	circIn: /*@__PURE__*/ vn([
		0,
		.65,
		.55,
		1
	]),
	circOut: /*@__PURE__*/ vn([
		.55,
		0,
		1,
		.45
	]),
	backIn: /*@__PURE__*/ vn([
		.31,
		.01,
		.66,
		-.59
	]),
	backOut: /*@__PURE__*/ vn([
		.33,
		1.53,
		.69,
		.99
	])
};
function bn(e, t) {
	if (e) return typeof e == "function" && hn() ? gn(e, t) : fn(e) ? vn(e) : Array.isArray(e) ? e.map((e) => bn(e, t) || yn.easeOut) : yn[e];
}
// ../build-deps/node_modules/motion-dom/dist/es/gestures/drag/state/is-active.mjs
var xn = {
	x: !1,
	y: !1
};
function Sn() {
	return xn.x || xn.y;
}
// ../build-deps/node_modules/motion-dom/dist/es/utils/resolve-elements.mjs
function Cn(e, t, n) {
	if (e instanceof Element) return [e];
	if (typeof e == "string") {
		let r = document;
		t && (r = t.current);
		let i = n?.[e] ?? r.querySelectorAll(e);
		return i ? Array.from(i) : [];
	}
	return Array.from(e);
}
// ../build-deps/node_modules/motion-dom/dist/es/gestures/utils/setup.mjs
function wn(e, t) {
	let n = Cn(e), r = new AbortController();
	return [
		n,
		{
			passive: !0,
			...t,
			signal: r.signal
		},
		() => r.abort()
	];
}
// ../build-deps/node_modules/motion-dom/dist/es/gestures/hover.mjs
function Tn(e) {
	return (t) => {
		t.pointerType === "touch" || Sn() || e(t);
	};
}
function En(e, t, n = {}) {
	let [r, i, a] = wn(e, n), o = Tn((e) => {
		let { target: n } = e, r = t(e);
		if (typeof r != "function" || !n) return;
		let a = Tn((e) => {
			r(e), n.removeEventListener("pointerleave", a);
		});
		n.addEventListener("pointerleave", a, i);
	});
	return r.forEach((e) => {
		e.addEventListener("pointerenter", o, i);
	}), a;
}
// ../build-deps/node_modules/motion-dom/dist/es/gestures/utils/is-node-or-child.mjs
var Dn = (e, t) => t ? e === t || Dn(e, t.parentElement) : !1, On = (e) => e.pointerType === "mouse" ? typeof e.button != "number" || e.button <= 0 : e.isPrimary !== !1, kn = /* @__PURE__ */ new Set([
	"BUTTON",
	"INPUT",
	"SELECT",
	"TEXTAREA",
	"A"
]);
function An(e) {
	return kn.has(e.tagName) || e.tabIndex !== -1;
}
// ../build-deps/node_modules/motion-dom/dist/es/gestures/press/utils/state.mjs
var jn = /* @__PURE__ */ new WeakSet();
// ../build-deps/node_modules/motion-dom/dist/es/gestures/press/utils/keyboard.mjs
function Mn(e) {
	return (t) => {
		t.key === "Enter" && e(t);
	};
}
function Nn(e, t) {
	e.dispatchEvent(new PointerEvent("pointer" + t, {
		isPrimary: !0,
		bubbles: !0
	}));
}
var Pn = (e, t) => {
	let n = e.currentTarget;
	if (!n) return;
	let r = Mn(() => {
		if (jn.has(n)) return;
		Nn(n, "down");
		let e = Mn(() => {
			Nn(n, "up");
		});
		n.addEventListener("keyup", e, t), n.addEventListener("blur", () => Nn(n, "cancel"), t);
	});
	n.addEventListener("keydown", r, t), n.addEventListener("blur", () => n.removeEventListener("keydown", r), t);
};
// ../build-deps/node_modules/motion-dom/dist/es/gestures/press/index.mjs
function Fn(e) {
	return On(e) && !Sn();
}
function In(e, t, n = {}) {
	let [r, i, a] = wn(e, n), o = (e) => {
		let r = e.currentTarget;
		if (!Fn(e) || jn.has(r)) return;
		jn.add(r);
		let a = t(e), o = (e, t) => {
			window.removeEventListener("pointerup", s), window.removeEventListener("pointercancel", c), Fn(e) && jn.has(r) && (jn.delete(r), typeof a == "function" && a(e, { success: t }));
		}, s = (e) => {
			o(e, n.useGlobalTarget || Dn(r, e.target));
		}, c = (e) => {
			o(e, !1);
		};
		window.addEventListener("pointerup", s, i), window.addEventListener("pointercancel", c, i);
	};
	return r.forEach((e) => {
		!An(e) && e.getAttribute("tabindex") === null && (e.tabIndex = 0), (n.useGlobalTarget ? window : e).addEventListener("pointerdown", o, i), e.addEventListener("focus", (e) => Pn(e, i), i);
	}), a;
}
// ../build-deps/node_modules/motion-dom/dist/es/gestures/drag/state/set-active.mjs
function Ln(e) {
	return e === "x" || e === "y" ? xn[e] ? null : (xn[e] = !0, () => {
		xn[e] = !1;
	}) : xn.x || xn.y ? null : (xn.x = xn.y = !0, () => {
		xn.x = xn.y = !1;
	});
}
// ../build-deps/node_modules/framer-motion/dist/es/frameloop/sync-time.mjs
var Rn;
function zn() {
	Rn = void 0;
}
var Bn = {
	now: () => (Rn === void 0 && Bn.set(H.isProcessing || z.useManualTiming ? H.timestamp : performance.now()), Rn),
	set: (e) => {
		Rn = e, queueMicrotask(zn);
	}
};
// ../build-deps/node_modules/framer-motion/dist/es/utils/array.mjs
function Vn(e, t) {
	e.indexOf(t) === -1 && e.push(t);
}
function Hn(e, t) {
	let n = e.indexOf(t);
	n > -1 && e.splice(n, 1);
}
// ../build-deps/node_modules/framer-motion/dist/es/utils/subscription-manager.mjs
var Un = class {
	constructor() {
		this.subscriptions = [];
	}
	add(e) {
		return Vn(this.subscriptions, e), () => Hn(this.subscriptions, e);
	}
	notify(e, t, n) {
		let r = this.subscriptions.length;
		if (r) {
			if (r === 1) this.subscriptions[0](e, t, n);
			else for (let i = 0; i < r; i++) {
				let r = this.subscriptions[i];
				r && r(e, t, n);
			}
		}
	}
	getSize() {
		return this.subscriptions.length;
	}
	clear() {
		this.subscriptions.length = 0;
	}
};
// ../build-deps/node_modules/framer-motion/dist/es/utils/velocity-per-second.mjs
function Wn(e, t) {
	return t ? 1e3 / t * e : 0;
}
// ../build-deps/node_modules/framer-motion/dist/es/value/index.mjs
var Gn = 30, Kn = (e) => !isNaN(parseFloat(e)), qn = { current: void 0 }, Jn = class {
	constructor(e, t = {}) {
		this.version = "11.16.4", this.canTrackVelocity = null, this.events = {}, this.updateAndNotify = (e, t = !0) => {
			let n = Bn.now();
			this.updatedAt !== n && this.setPrevFrameValue(), this.prev = this.current, this.setCurrent(e), this.current !== this.prev && this.events.change && this.events.change.notify(this.current), t && this.events.renderRequest && this.events.renderRequest.notify(this.current);
		}, this.hasAnimated = !1, this.setCurrent(e), this.owner = t.owner;
	}
	setCurrent(e) {
		this.current = e, this.updatedAt = Bn.now(), this.canTrackVelocity === null && e !== void 0 && (this.canTrackVelocity = Kn(this.current));
	}
	setPrevFrameValue(e = this.current) {
		this.prevFrameValue = e, this.prevUpdatedAt = this.updatedAt;
	}
	onChange(e) {
		return process.env.NODE_ENV !== "production" && ve(!1, "value.onChange(callback) is deprecated. Switch to value.on(\"change\", callback)."), this.on("change", e);
	}
	on(e, t) {
		this.events[e] || (this.events[e] = new Un());
		let n = this.events[e].add(t);
		return e === "change" ? () => {
			n(), B.read(() => {
				this.events.change.getSize() || this.stop();
			});
		} : n;
	}
	clearListeners() {
		for (let e in this.events) this.events[e].clear();
	}
	attach(e, t) {
		this.passiveEffect = e, this.stopPassiveEffect = t;
	}
	set(e, t = !0) {
		!t || !this.passiveEffect ? this.updateAndNotify(e, t) : this.passiveEffect(e, this.updateAndNotify);
	}
	setWithVelocity(e, t, n) {
		this.set(t), this.prev = void 0, this.prevFrameValue = e, this.prevUpdatedAt = this.updatedAt - n;
	}
	jump(e, t = !0) {
		this.updateAndNotify(e), this.prev = e, this.prevUpdatedAt = this.prevFrameValue = void 0, t && this.stop(), this.stopPassiveEffect && this.stopPassiveEffect();
	}
	get() {
		return qn.current && qn.current.push(this), this.current;
	}
	getPrevious() {
		return this.prev;
	}
	getVelocity() {
		let e = Bn.now();
		if (!this.canTrackVelocity || this.prevFrameValue === void 0 || e - this.updatedAt > Gn) return 0;
		let t = Math.min(this.updatedAt - this.prevUpdatedAt, Gn);
		return Wn(parseFloat(this.current) - parseFloat(this.prevFrameValue), t);
	}
	start(e) {
		return this.stop(), new Promise((t) => {
			this.hasAnimated = !0, this.animation = e(t), this.events.animationStart && this.events.animationStart.notify();
		}).then(() => {
			this.events.animationComplete && this.events.animationComplete.notify(), this.clearAnimation();
		});
	}
	stop() {
		this.animation && (this.animation.stop(), this.events.animationCancel && this.events.animationCancel.notify()), this.clearAnimation();
	}
	isAnimating() {
		return !!this.animation;
	}
	clearAnimation() {
		delete this.animation;
	}
	destroy() {
		this.clearListeners(), this.stop(), this.stopPassiveEffect && this.stopPassiveEffect();
	}
};
function Yn(e, t) {
	return new Jn(e, t);
}
// ../build-deps/node_modules/framer-motion/dist/es/render/utils/setters.mjs
function Xn(e, t, n) {
	e.hasValue(t) ? e.getValue(t).set(n) : e.addValue(t, Yn(n));
}
function Zn(e, t) {
	let { transitionEnd: n = {}, transition: r = {}, ...i } = nn(e, t) || {};
	i = {
		...i,
		...n
	};
	for (let t in i) Xn(e, t, ct(i[t]));
}
// ../build-deps/node_modules/framer-motion/dist/es/value/use-will-change/is.mjs
function Qn(e) {
	return !!(Xe(e) && e.add);
}
// ../build-deps/node_modules/framer-motion/dist/es/value/use-will-change/add-will-change.mjs
function $n(e, t) {
	let n = e.getValue("willChange");
	if (Qn(n)) return n.add(t);
}
// ../build-deps/node_modules/framer-motion/dist/es/animation/optimized-appear/get-appear-id.mjs
function er(e) {
	return e.props[Pe];
}
// ../build-deps/node_modules/framer-motion/dist/es/utils/use-instant-transition-state.mjs
var tr = { current: !1 }, nr = (e, t, n) => (((1 - 3 * n + 3 * t) * e + (3 * n - 6 * t)) * e + 3 * t) * e, rr = 1e-7, ir = 12;
function ar(e, t, n, r, i) {
	let a, o, s = 0;
	do
		o = t + (n - t) / 2, a = nr(o, r, i) - e, a > 0 ? n = o : t = o;
	while (Math.abs(a) > rr && ++s < ir);
	return o;
}
function or(e, t, n, r) {
	if (e === t && n === r) return N;
	let i = (t) => ar(t, 0, 1, e, n);
	return (e) => e === 0 || e === 1 ? e : nr(i(e), t, r);
}
// ../build-deps/node_modules/framer-motion/dist/es/easing/modifiers/mirror.mjs
var sr = (e) => (t) => t <= .5 ? e(2 * t) / 2 : (2 - e(2 * (1 - t))) / 2, cr = (e) => (t) => 1 - e(1 - t), lr = /*@__PURE__*/ or(.33, 1.53, .69, .99), ur = /*@__PURE__*/ cr(lr), dr = /*@__PURE__*/ sr(ur), fr = (e) => (e *= 2) < 1 ? .5 * ur(e) : .5 * (2 - 2 ** (-10 * (e - 1))), pr = (e) => 1 - Math.sin(Math.acos(e)), mr = cr(pr), hr = sr(pr), gr = (e) => /^0[^.\s]+$/u.test(e);
// ../build-deps/node_modules/framer-motion/dist/es/animation/utils/is-none.mjs
function _r(e) {
	return typeof e == "number" ? e === 0 : e === null || e === "none" || e === "0" || gr(e);
}
// ../build-deps/node_modules/framer-motion/dist/es/utils/is-numerical-string.mjs
var vr = (e) => /^-?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(e), yr = /^var\(--(?:([\w-]+)|([\w-]+), ?([a-zA-Z\d ()%#.,-]+))\)/u;
function br(e) {
	let t = yr.exec(e);
	if (!t) return [,];
	let [, n, r, i] = t;
	return [`--${n ?? r}`, i];
}
var xr = 4;
function Sr(e, t, n = 1) {
	ne(n <= xr, `Max CSS variable fallback depth detected in property "${e}". This may indicate a circular fallback dependency.`);
	let [r, i] = br(e);
	if (!r) return;
	let a = window.getComputedStyle(t).getPropertyValue(r);
	if (a) {
		let e = a.trim();
		return vr(e) ? parseFloat(e) : e;
	}
	return It(i) ? Sr(i, t, n + 1) : i;
}
// ../build-deps/node_modules/framer-motion/dist/es/render/dom/utils/unit-conversion.mjs
var Cr = /* @__PURE__ */ new Set([
	"width",
	"height",
	"top",
	"left",
	"right",
	"bottom",
	"x",
	"y",
	"translateX",
	"translateY"
]), wr = (e) => e === _t || e === J, Tr = (e, t) => parseFloat(e.split(", ")[t]), Er = (e, t) => (n, { transform: r }) => {
	if (r === "none" || !r) return 0;
	let i = r.match(/^matrix3d\((.+)\)$/u);
	if (i) return Tr(i[1], t);
	{
		let t = r.match(/^matrix\((.+)\)$/u);
		return t ? Tr(t[1], e) : 0;
	}
}, Dr = /* @__PURE__ */ new Set([
	"x",
	"y",
	"z"
]), Or = $e.filter((e) => !Dr.has(e));
function kr(e) {
	let t = [];
	return Or.forEach((n) => {
		let r = e.getValue(n);
		r !== void 0 && (t.push([n, r.get()]), r.set(+!!n.startsWith("scale")));
	}), t;
}
var Ar = {
	width: ({ x: e }, { paddingLeft: t = "0", paddingRight: n = "0" }) => e.max - e.min - parseFloat(t) - parseFloat(n),
	height: ({ y: e }, { paddingTop: t = "0", paddingBottom: n = "0" }) => e.max - e.min - parseFloat(t) - parseFloat(n),
	top: (e, { top: t }) => parseFloat(t),
	left: (e, { left: t }) => parseFloat(t),
	bottom: ({ y: e }, { top: t }) => parseFloat(t) + (e.max - e.min),
	right: ({ x: e }, { left: t }) => parseFloat(t) + (e.max - e.min),
	x: Er(4, 13),
	y: Er(5, 14)
};
Ar.translateX = Ar.x, Ar.translateY = Ar.y;
// ../build-deps/node_modules/framer-motion/dist/es/render/dom/value-types/test.mjs
var jr = (e) => (t) => t.test(e), Mr = [
	_t,
	J,
	St,
	xt,
	wt,
	Ct,
	{
		test: (e) => e === "auto",
		parse: (e) => e
	}
], Nr = (e) => Mr.find(jr(e)), Pr = /* @__PURE__ */ new Set(), Fr = !1, Ir = !1;
function Lr() {
	if (Ir) {
		let e = Array.from(Pr).filter((e) => e.needsMeasurement), t = new Set(e.map((e) => e.element)), n = /* @__PURE__ */ new Map();
		t.forEach((e) => {
			let t = kr(e);
			t.length && (n.set(e, t), e.render());
		}), e.forEach((e) => e.measureInitialState()), t.forEach((e) => {
			e.render();
			let t = n.get(e);
			t && t.forEach(([t, n]) => {
				var r;
				(r = e.getValue(t)) == null || r.set(n);
			});
		}), e.forEach((e) => e.measureEndState()), e.forEach((e) => {
			e.suspendedScrollY !== void 0 && window.scrollTo(0, e.suspendedScrollY);
		});
	}
	Ir = !1, Fr = !1, Pr.forEach((e) => e.complete()), Pr.clear();
}
function Rr() {
	Pr.forEach((e) => {
		e.readKeyframes(), e.needsMeasurement && (Ir = !0);
	});
}
function zr() {
	Rr(), Lr();
}
var Br = class {
	constructor(e, t, n, r, i, a = !1) {
		this.isComplete = !1, this.isAsync = !1, this.needsMeasurement = !1, this.isScheduled = !1, this.unresolvedKeyframes = [...e], this.onComplete = t, this.name = n, this.motionValue = r, this.element = i, this.isAsync = a;
	}
	scheduleResolve() {
		this.isScheduled = !0, this.isAsync ? (Pr.add(this), Fr || (Fr = !0, B.read(Rr), B.resolveKeyframes(Lr))) : (this.readKeyframes(), this.complete());
	}
	readKeyframes() {
		let { unresolvedKeyframes: e, name: t, element: n, motionValue: r } = this;
		for (let i = 0; i < e.length; i++) if (e[i] === null) {
			if (i === 0) {
				let i = r?.get(), a = e[e.length - 1];
				if (i !== void 0) e[0] = i;
				else if (n && t) {
					let r = n.readValue(t, a);
					r != null && (e[0] = r);
				}
				e[0] === void 0 && (e[0] = a), r && i === void 0 && r.set(e[0]);
			} else e[i] = e[i - 1];
		}
	}
	setFinalKeyframe() {}
	measureInitialState() {}
	renderEndStyles() {}
	measureEndState() {}
	complete() {
		this.isComplete = !0, this.onComplete(this.unresolvedKeyframes, this.finalKeyframe), Pr.delete(this);
	}
	cancel() {
		this.isComplete || (this.isScheduled = !1, Pr.delete(this));
	}
	resume() {
		this.isComplete || this.scheduleResolve();
	}
}, Vr = (e) => Math.round(e * 1e5) / 1e5, Hr = /-?(?:\d+(?:\.\d+)?|\.\d+)/gu;
// ../build-deps/node_modules/framer-motion/dist/es/value/types/utils/is-nullish.mjs
function Ur(e) {
	return e == null;
}
// ../build-deps/node_modules/framer-motion/dist/es/value/types/utils/single-color-regex.mjs
var Wr = /^(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\((?:-?[\d.]+%?[,\s]+){2}-?[\d.]+%?\s*(?:[,/]\s*)?(?:\b\d+(?:\.\d+)?|\.\d+)?%?\))$/iu, Gr = (e, t) => (n) => !!(typeof n == "string" && Wr.test(n) && n.startsWith(e) || t && !Ur(n) && Object.prototype.hasOwnProperty.call(n, t)), Kr = (e, t, n) => (r) => {
	if (typeof r != "string") return r;
	let [i, a, o, s] = r.match(Hr);
	return {
		[e]: parseFloat(i),
		[t]: parseFloat(a),
		[n]: parseFloat(o),
		alpha: s === void 0 ? 1 : parseFloat(s)
	};
}, qr = (e) => gt(0, 255, e), Jr = {
	..._t,
	transform: (e) => Math.round(qr(e))
}, Yr = {
	test: /*@__PURE__*/ Gr("rgb", "red"),
	parse: /*@__PURE__*/ Kr("red", "green", "blue"),
	transform: ({ red: e, green: t, blue: n, alpha: r = 1 }) => "rgba(" + Jr.transform(e) + ", " + Jr.transform(t) + ", " + Jr.transform(n) + ", " + Vr(vt.transform(r)) + ")"
};
// ../build-deps/node_modules/framer-motion/dist/es/value/types/color/hex.mjs
function Xr(e) {
	let t = "", n = "", r = "", i = "";
	return e.length > 5 ? (t = e.substring(1, 3), n = e.substring(3, 5), r = e.substring(5, 7), i = e.substring(7, 9)) : (t = e.substring(1, 2), n = e.substring(2, 3), r = e.substring(3, 4), i = e.substring(4, 5), t += t, n += n, r += r, i += i), {
		red: parseInt(t, 16),
		green: parseInt(n, 16),
		blue: parseInt(r, 16),
		alpha: i ? parseInt(i, 16) / 255 : 1
	};
}
var Zr = {
	test: /*@__PURE__*/ Gr("#"),
	parse: Xr,
	transform: Yr.transform
}, Qr = {
	test: /*@__PURE__*/ Gr("hsl", "hue"),
	parse: /*@__PURE__*/ Kr("hue", "saturation", "lightness"),
	transform: ({ hue: e, saturation: t, lightness: n, alpha: r = 1 }) => "hsla(" + Math.round(e) + ", " + St.transform(Vr(t)) + ", " + St.transform(Vr(n)) + ", " + Vr(vt.transform(r)) + ")"
}, $r = {
	test: (e) => Yr.test(e) || Zr.test(e) || Qr.test(e),
	parse: (e) => Yr.test(e) ? Yr.parse(e) : Qr.test(e) ? Qr.parse(e) : Zr.parse(e),
	transform: (e) => typeof e == "string" ? e : e.hasOwnProperty("red") ? Yr.transform(e) : Qr.transform(e)
}, ei = /(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\((?:-?[\d.]+%?[,\s]+){2}-?[\d.]+%?\s*(?:[,/]\s*)?(?:\b\d+(?:\.\d+)?|\.\d+)?%?\))/giu;
// ../build-deps/node_modules/framer-motion/dist/es/value/types/complex/index.mjs
function ti(e) {
	return isNaN(e) && typeof e == "string" && (e.match(Hr)?.length || 0) + (e.match(ei)?.length || 0) > 0;
}
var ni = "number", ri = "color", ii = "var", ai = "var(", oi = "${}", si = /var\s*\(\s*--(?:[\w-]+\s*|[\w-]+\s*,(?:\s*[^)(\s]|\s*\((?:[^)(]|\([^)(]*\))*\))+\s*)\)|#[\da-f]{3,8}|(?:rgb|hsl)a?\((?:-?[\d.]+%?[,\s]+){2}-?[\d.]+%?\s*(?:[,/]\s*)?(?:\b\d+(?:\.\d+)?|\.\d+)?%?\)|-?(?:\d+(?:\.\d+)?|\.\d+)/giu;
function ci(e) {
	let t = e.toString(), n = [], r = {
		color: [],
		number: [],
		var: []
	}, i = [], a = 0;
	return {
		values: n,
		split: t.replace(si, (e) => ($r.test(e) ? (r.color.push(a), i.push(ri), n.push($r.parse(e))) : e.startsWith(ai) ? (r.var.push(a), i.push(ii), n.push(e)) : (r.number.push(a), i.push(ni), n.push(parseFloat(e))), ++a, oi)).split(oi),
		indexes: r,
		types: i
	};
}
function li(e) {
	return ci(e).values;
}
function ui(e) {
	let { split: t, types: n } = ci(e), r = t.length;
	return (e) => {
		let i = "";
		for (let a = 0; a < r; a++) if (i += t[a], e[a] !== void 0) {
			let t = n[a];
			i += t === ni ? Vr(e[a]) : t === ri ? $r.transform(e[a]) : e[a];
		}
		return i;
	};
}
var di = (e) => typeof e == "number" ? 0 : e;
function fi(e) {
	let t = li(e);
	return ui(e)(t.map(di));
}
var pi = {
	test: ti,
	parse: li,
	createTransformer: ui,
	getAnimatableNone: fi
}, mi = /* @__PURE__ */ new Set([
	"brightness",
	"contrast",
	"saturate",
	"opacity"
]);
function hi(e) {
	let [t, n] = e.slice(0, -1).split("(");
	if (t === "drop-shadow") return e;
	let [r] = n.match(Hr) || [];
	if (!r) return e;
	let i = n.replace(r, ""), a = +!!mi.has(t);
	return r !== n && (a *= 100), t + "(" + a + i + ")";
}
var gi = /\b([a-z-]*)\(.*?\)/gu, _i = {
	...pi,
	getAnimatableNone: (e) => {
		let t = e.match(gi);
		return t ? t.map(hi).join(" ") : e;
	}
}, vi = {
	...kt,
	color: $r,
	backgroundColor: $r,
	outlineColor: $r,
	fill: $r,
	stroke: $r,
	borderColor: $r,
	borderTopColor: $r,
	borderRightColor: $r,
	borderBottomColor: $r,
	borderLeftColor: $r,
	filter: _i,
	WebkitFilter: _i
}, yi = (e) => vi[e];
// ../build-deps/node_modules/framer-motion/dist/es/render/dom/value-types/animatable-none.mjs
function bi(e, t) {
	let n = yi(e);
	return n !== _i && (n = pi), n.getAnimatableNone ? n.getAnimatableNone(t) : void 0;
}
// ../build-deps/node_modules/framer-motion/dist/es/render/html/utils/make-none-animatable.mjs
var xi = /* @__PURE__ */ new Set([
	"auto",
	"none",
	"0"
]);
function Si(e, t, n) {
	let r = 0, i;
	for (; r < e.length && !i;) {
		let t = e[r];
		typeof t == "string" && !xi.has(t) && ci(t).values.length && (i = e[r]), r++;
	}
	if (i && n) for (let r of t) e[r] = bi(n, i);
}
// ../build-deps/node_modules/framer-motion/dist/es/render/dom/DOMKeyframesResolver.mjs
var Ci = class extends Br {
	constructor(e, t, n, r, i) {
		super(e, t, n, r, i, !0);
	}
	readKeyframes() {
		let { unresolvedKeyframes: e, element: t, name: n } = this;
		if (!t || !t.current) return;
		super.readKeyframes();
		for (let n = 0; n < e.length; n++) {
			let r = e[n];
			if (typeof r == "string" && (r = r.trim(), It(r))) {
				let i = Sr(r, t.current);
				i !== void 0 && (e[n] = i), n === e.length - 1 && (this.finalKeyframe = r);
			}
		}
		if (this.resolveNoneKeyframes(), !Cr.has(n) || e.length !== 2) return;
		let [r, i] = e, a = Nr(r), o = Nr(i);
		if (a !== o) {
			if (wr(a) && wr(o)) for (let t = 0; t < e.length; t++) {
				let n = e[t];
				typeof n == "string" && (e[t] = parseFloat(n));
			}
			else this.needsMeasurement = !0;
		}
	}
	resolveNoneKeyframes() {
		let { unresolvedKeyframes: e, name: t } = this, n = [];
		for (let t = 0; t < e.length; t++) _r(e[t]) && n.push(t);
		n.length && Si(e, n, t);
	}
	measureInitialState() {
		let { element: e, unresolvedKeyframes: t, name: n } = this;
		if (!e || !e.current) return;
		n === "height" && (this.suspendedScrollY = window.pageYOffset), this.measuredOrigin = Ar[n](e.measureViewportBox(), window.getComputedStyle(e.current)), t[0] = this.measuredOrigin;
		let r = t[t.length - 1];
		r !== void 0 && e.getValue(n, r).jump(r, !1);
	}
	measureEndState() {
		let { element: e, name: t, unresolvedKeyframes: n } = this;
		if (!e || !e.current) return;
		let r = e.getValue(t);
		r && r.jump(this.measuredOrigin, !1);
		let i = n.length - 1, a = n[i];
		n[i] = Ar[t](e.measureViewportBox(), window.getComputedStyle(e.current)), a !== null && this.finalKeyframe === void 0 && (this.finalKeyframe = a), this.removedTransforms?.length && this.removedTransforms.forEach(([t, n]) => {
			e.getValue(t).set(n);
		}), this.resolveNoneKeyframes();
	}
}, wi = (e, t) => t !== "zIndex" && !!(typeof e == "number" || Array.isArray(e) || typeof e == "string" && (pi.test(e) || e === "0") && !e.startsWith("url("));
// ../build-deps/node_modules/framer-motion/dist/es/animation/animators/utils/can-animate.mjs
function Ti(e) {
	let t = e[0];
	if (e.length === 1) return !0;
	for (let n = 0; n < e.length; n++) if (e[n] !== t) return !0;
}
function Ei(e, t, n, r) {
	let i = e[0];
	if (i === null) return !1;
	if (t === "display" || t === "visibility") return !0;
	let a = e[e.length - 1], o = wi(i, t), s = wi(a, t);
	return P(o === s, `You are trying to animate ${t} from "${i}" to "${a}". ${i} is not an animatable value - to enable this animation set ${i} to a value animatable to ${a} via the \`style\` property.`), !o || !s ? !1 : Ti(e) || (n === "spring" || un(n)) && r;
}
// ../build-deps/node_modules/framer-motion/dist/es/animation/animators/waapi/utils/get-final-keyframe.mjs
var Di = (e) => e !== null;
function Oi(e, { repeat: t, repeatType: n = "loop" }, r) {
	let i = e.filter(Di), a = t && n !== "loop" && t % 2 == 1 ? 0 : i.length - 1;
	return !a || r === void 0 ? i[a] : r;
}
// ../build-deps/node_modules/framer-motion/dist/es/animation/animators/BaseAnimation.mjs
var ki = 40, Ai = class {
	constructor({ autoplay: e = !0, delay: t = 0, type: n = "keyframes", repeat: r = 0, repeatDelay: i = 0, repeatType: a = "loop", ...o }) {
		this.isStopped = !1, this.hasAttemptedResolve = !1, this.createdAt = Bn.now(), this.options = {
			autoplay: e,
			delay: t,
			type: n,
			repeat: r,
			repeatDelay: i,
			repeatType: a,
			...o
		}, this.updateFinishedPromise();
	}
	calcStartTime() {
		return this.resolvedAt && this.resolvedAt - this.createdAt > ki ? this.resolvedAt : this.createdAt;
	}
	get resolved() {
		return !this._resolved && !this.hasAttemptedResolve && zr(), this._resolved;
	}
	onKeyframesResolved(e, t) {
		this.resolvedAt = Bn.now(), this.hasAttemptedResolve = !0;
		let { name: n, type: r, velocity: i, delay: a, onComplete: o, onUpdate: s, isGenerator: c } = this.options;
		if (!c && !Ei(e, n, r, i)) {
			if (tr.current || !a) {
				s?.(Oi(e, this.options, t)), o?.(), this.resolveFinishedPromise();
				return;
			}
			this.options.duration = 0;
		}
		let l = this.initPlayback(e, t);
		l !== !1 && (this._resolved = {
			keyframes: e,
			finalKeyframe: t,
			...l
		}, this.onPostResolved());
	}
	onPostResolved() {}
	then(e, t) {
		return this.currentFinishedPromise.then(e, t);
	}
	flatten() {
		this.options.type = "keyframes", this.options.ease = "linear";
	}
	updateFinishedPromise() {
		this.currentFinishedPromise = new Promise((e) => {
			this.resolveFinishedPromise = e;
		});
	}
}, Y = (e, t, n) => e + (t - e) * n;
// ../build-deps/node_modules/framer-motion/dist/es/utils/hsla-to-rgba.mjs
function ji(e, t, n) {
	return n < 0 && (n += 1), n > 1 && --n, n < 1 / 6 ? e + (t - e) * 6 * n : n < 1 / 2 ? t : n < 2 / 3 ? e + (t - e) * (2 / 3 - n) * 6 : e;
}
function Mi({ hue: e, saturation: t, lightness: n, alpha: r }) {
	e /= 360, t /= 100, n /= 100;
	let i = 0, a = 0, o = 0;
	if (!t) i = a = o = n;
	else {
		let r = n < .5 ? n * (1 + t) : n + t - n * t, s = 2 * n - r;
		i = ji(s, r, e + 1 / 3), a = ji(s, r, e), o = ji(s, r, e - 1 / 3);
	}
	return {
		red: Math.round(i * 255),
		green: Math.round(a * 255),
		blue: Math.round(o * 255),
		alpha: r
	};
}
// ../build-deps/node_modules/framer-motion/dist/es/utils/mix/immediate.mjs
function Ni(e, t) {
	return (n) => n > 0 ? t : e;
}
// ../build-deps/node_modules/framer-motion/dist/es/utils/mix/color.mjs
var Pi = (e, t, n) => {
	let r = e * e, i = n * (t * t - r) + r;
	return i < 0 ? 0 : Math.sqrt(i);
}, Fi = [
	Zr,
	Yr,
	Qr
], Ii = (e) => Fi.find((t) => t.test(e));
function Li(e) {
	let t = Ii(e);
	if (P(!!t, `'${e}' is not an animatable color. Use the equivalent color code instead.`), !t) return !1;
	let n = t.parse(e);
	return t === Qr && (n = Mi(n)), n;
}
var Ri = (e, t) => {
	let n = Li(e), r = Li(t);
	if (!n || !r) return Ni(e, t);
	let i = { ...n };
	return (e) => (i.red = Pi(n.red, r.red, e), i.green = Pi(n.green, r.green, e), i.blue = Pi(n.blue, r.blue, e), i.alpha = Y(n.alpha, r.alpha, e), Yr.transform(i));
}, zi = (e, t) => (n) => t(e(n)), Bi = (...e) => e.reduce(zi), Vi = /* @__PURE__ */ new Set(["none", "hidden"]);
function Hi(e, t) {
	return Vi.has(e) ? (n) => n <= 0 ? e : t : (n) => n >= 1 ? t : e;
}
// ../build-deps/node_modules/framer-motion/dist/es/utils/mix/complex.mjs
function Ui(e, t) {
	return (n) => Y(e, t, n);
}
function Wi(e) {
	return typeof e == "number" ? Ui : typeof e == "string" ? It(e) ? Ni : $r.test(e) ? Ri : Ji : Array.isArray(e) ? Gi : typeof e == "object" ? $r.test(e) ? Ri : Ki : Ni;
}
function Gi(e, t) {
	let n = [...e], r = n.length, i = e.map((e, n) => Wi(e)(e, t[n]));
	return (e) => {
		for (let t = 0; t < r; t++) n[t] = i[t](e);
		return n;
	};
}
function Ki(e, t) {
	let n = {
		...e,
		...t
	}, r = {};
	for (let i in n) e[i] !== void 0 && t[i] !== void 0 && (r[i] = Wi(e[i])(e[i], t[i]));
	return (e) => {
		for (let t in r) n[t] = r[t](e);
		return n;
	};
}
function qi(e, t) {
	let n = [], r = {
		color: 0,
		var: 0,
		number: 0
	};
	for (let i = 0; i < t.values.length; i++) {
		let a = t.types[i], o = e.indexes[a][r[a]], s = e.values[o] ?? 0;
		n[i] = s, r[a]++;
	}
	return n;
}
var Ji = (e, t) => {
	let n = pi.createTransformer(t), r = ci(e), i = ci(t);
	return r.indexes.var.length === i.indexes.var.length && r.indexes.color.length === i.indexes.color.length && r.indexes.number.length >= i.indexes.number.length ? Vi.has(e) && !i.values.length || Vi.has(t) && !r.values.length ? Hi(e, t) : Bi(Gi(qi(r, i), i.values), n) : (P(!0, `Complex values '${e}' and '${t}' too different to mix. Ensure all colors are of the same type, and that each contains the same quantity of number and color values. Falling back to instant transition.`), Ni(e, t));
};
// ../build-deps/node_modules/framer-motion/dist/es/utils/mix/index.mjs
function Yi(e, t, n) {
	return typeof e == "number" && typeof t == "number" && typeof n == "number" ? Y(e, t, n) : Wi(e)(e, t);
}
// ../build-deps/node_modules/framer-motion/dist/es/animation/generators/utils/velocity.mjs
var Xi = 5;
function Zi(e, t, n) {
	let r = Math.max(t - Xi, 0);
	return Wn(n - e(r), t - r);
}
// ../build-deps/node_modules/framer-motion/dist/es/animation/generators/spring/defaults.mjs
var X = {
	stiffness: 100,
	damping: 10,
	mass: 1,
	velocity: 0,
	duration: 800,
	bounce: .3,
	visualDuration: .3,
	restSpeed: {
		granular: .01,
		default: 2
	},
	restDelta: {
		granular: .005,
		default: .5
	},
	minDuration: .01,
	maxDuration: 10,
	minDamping: .05,
	maxDamping: 1
}, Qi = .001;
function $i({ duration: e = X.duration, bounce: t = X.bounce, velocity: n = X.velocity, mass: r = X.mass }) {
	let i, a;
	P(e <= /* @__PURE__ */ I(X.maxDuration), "Spring duration must be 10 seconds or less");
	let o = 1 - t;
	o = gt(X.minDamping, X.maxDamping, o), e = gt(X.minDuration, X.maxDuration, /* @__PURE__ */ L(e)), o < 1 ? (i = (t) => {
		let r = t * o, i = r * e, a = r - n, s = na(t, o), c = Math.exp(-i);
		return Qi - a / s * c;
	}, a = (t) => {
		let r = t * o * e, a = r * n + n, s = o ** 2 * t ** 2 * e, c = Math.exp(-r), l = na(t ** 2, o);
		return (-i(t) + Qi > 0 ? -1 : 1) * ((a - s) * c) / l;
	}) : (i = (t) => -.001 + Math.exp(-t * e) * ((t - n) * e + 1), a = (t) => Math.exp(-t * e) * ((n - t) * (e * e)));
	let s = 5 / e, c = ta(i, a, s);
	if (e = /* @__PURE__ */ I(e), isNaN(c)) return {
		stiffness: X.stiffness,
		damping: X.damping,
		duration: e
	};
	{
		let t = c ** 2 * r;
		return {
			stiffness: t,
			damping: o * 2 * Math.sqrt(r * t),
			duration: e
		};
	}
}
var ea = 12;
function ta(e, t, n) {
	let r = n;
	for (let n = 1; n < ea; n++) r -= e(r) / t(r);
	return r;
}
function na(e, t) {
	return e * Math.sqrt(1 - t * t);
}
// ../build-deps/node_modules/framer-motion/dist/es/animation/generators/spring/index.mjs
var ra = ["duration", "bounce"], ia = [
	"stiffness",
	"damping",
	"mass"
];
function aa(e, t) {
	return t.some((t) => e[t] !== void 0);
}
function oa(e) {
	let t = {
		velocity: X.velocity,
		stiffness: X.stiffness,
		damping: X.damping,
		mass: X.mass,
		isResolvedFromDuration: !1,
		...e
	};
	if (!aa(e, ia) && aa(e, ra)) {
		if (e.visualDuration) {
			let n = e.visualDuration, r = 2 * Math.PI / (n * 1.2), i = r * r, a = 2 * gt(.05, 1, 1 - (e.bounce || 0)) * Math.sqrt(i);
			t = {
				...t,
				mass: X.mass,
				stiffness: i,
				damping: a
			};
		} else {
			let n = $i(e);
			t = {
				...t,
				...n,
				mass: X.mass
			}, t.isResolvedFromDuration = !0;
		}
	}
	return t;
}
function sa(e = X.visualDuration, t = X.bounce) {
	let n = typeof e == "object" ? e : {
		visualDuration: e,
		keyframes: [0, 1],
		bounce: t
	}, { restSpeed: r, restDelta: i } = n, a = n.keyframes[0], o = n.keyframes[n.keyframes.length - 1], s = {
		done: !1,
		value: a
	}, { stiffness: c, damping: l, mass: u, duration: d, velocity: f, isResolvedFromDuration: p } = oa({
		...n,
		velocity: -/* @__PURE__ */ L(n.velocity || 0)
	}), m = f || 0, h = l / (2 * Math.sqrt(c * u)), g = o - a, _ = /* @__PURE__ */ L(Math.sqrt(c / u)), v = Math.abs(g) < 5;
	r ||= v ? X.restSpeed.granular : X.restSpeed.default, i ||= v ? X.restDelta.granular : X.restDelta.default;
	let y;
	if (h < 1) {
		let e = na(_, h);
		y = (t) => {
			let n = Math.exp(-h * _ * t);
			return o - n * ((m + h * _ * g) / e * Math.sin(e * t) + g * Math.cos(e * t));
		};
	} else if (h === 1) y = (e) => o - Math.exp(-_ * e) * (g + (m + _ * g) * e);
	else {
		let e = _ * Math.sqrt(h * h - 1);
		y = (t) => {
			let n = Math.exp(-h * _ * t), r = Math.min(e * t, 300);
			return o - n * ((m + h * _ * g) * Math.sinh(r) + e * g * Math.cosh(r)) / e;
		};
	}
	let b = {
		calculatedDuration: p && d || null,
		next: (e) => {
			let t = y(e);
			if (p) s.done = e >= d;
			else {
				let n = 0;
				h < 1 && (n = e === 0 ? /* @__PURE__ */ I(m) : Zi(y, e, t));
				let a = Math.abs(n) <= r, c = Math.abs(o - t) <= i;
				s.done = a && c;
			}
			return s.value = s.done ? o : t, s;
		},
		toString: () => {
			let e = Math.min(ln(b), cn), t = gn((t) => b.next(e * t).value, e, 30);
			return e + "ms " + t;
		}
	};
	return b;
}
// ../build-deps/node_modules/framer-motion/dist/es/animation/generators/inertia.mjs
function ca({ keyframes: e, velocity: t = 0, power: n = .8, timeConstant: r = 325, bounceDamping: i = 10, bounceStiffness: a = 500, modifyTarget: o, min: s, max: c, restDelta: l = .5, restSpeed: u }) {
	let d = e[0], f = {
		done: !1,
		value: d
	}, p = (e) => s !== void 0 && e < s || c !== void 0 && e > c, m = (e) => s === void 0 ? c : c === void 0 || Math.abs(s - e) < Math.abs(c - e) ? s : c, h = n * t, g = d + h, _ = o === void 0 ? g : o(g);
	_ !== g && (h = _ - d);
	let v = (e) => -h * Math.exp(-e / r), y = (e) => _ + v(e), b = (e) => {
		let t = v(e), n = y(e);
		f.done = Math.abs(t) <= l, f.value = f.done ? _ : n;
	}, x, S, C = (e) => {
		p(f.value) && (x = e, S = sa({
			keyframes: [f.value, m(f.value)],
			velocity: Zi(y, e, f.value),
			damping: i,
			stiffness: a,
			restDelta: l,
			restSpeed: u
		}));
	};
	return C(0), {
		calculatedDuration: null,
		next: (e) => {
			let t = !1;
			return !S && x === void 0 && (t = !0, b(e), C(e)), x !== void 0 && e >= x ? S.next(e - x) : (!t && b(e), f);
		}
	};
}
// ../build-deps/node_modules/framer-motion/dist/es/easing/ease.mjs
var la = /*@__PURE__*/ or(.42, 0, 1, 1), ua = /*@__PURE__*/ or(0, 0, .58, 1), da = /*@__PURE__*/ or(.42, 0, .58, 1), fa = (e) => Array.isArray(e) && typeof e[0] != "number", pa = {
	linear: N,
	easeIn: la,
	easeInOut: da,
	easeOut: ua,
	circIn: pr,
	circInOut: hr,
	circOut: mr,
	backIn: ur,
	backInOut: dr,
	backOut: lr,
	anticipate: fr
}, ma = (e) => {
	if (fn(e)) {
		ne(e.length === 4, "Cubic bezier arrays must contain four numerical values.");
		let [t, n, r, i] = e;
		return or(t, n, r, i);
	}
	return typeof e == "string" ? (ne(pa[e] !== void 0, `Invalid easing type '${e}'`), pa[e]) : e;
};
// ../build-deps/node_modules/framer-motion/dist/es/utils/interpolate.mjs
function ha(e, t, n) {
	let r = [], i = n || Yi, a = e.length - 1;
	for (let n = 0; n < a; n++) {
		let a = i(e[n], e[n + 1]);
		t && (a = Bi(Array.isArray(t) ? t[n] || N : t, a)), r.push(a);
	}
	return r;
}
function ga(e, t, { clamp: n = !0, ease: r, mixer: i } = {}) {
	let a = e.length;
	if (ne(a === t.length, "Both input and output ranges must be the same length"), a === 1) return () => t[0];
	if (a === 2 && e[0] === e[1]) return () => t[1];
	e[0] > e[a - 1] && (e = [...e].reverse(), t = [...t].reverse());
	let o = ha(t, r, i), s = o.length, c = (t) => {
		let n = 0;
		if (s > 1) for (; n < e.length - 2 && !(t < e[n + 1]); n++);
		let r = /* @__PURE__ */ F(e[n], e[n + 1], t);
		return o[n](r);
	};
	return n ? (t) => c(gt(e[0], e[a - 1], t)) : c;
}
// ../build-deps/node_modules/framer-motion/dist/es/utils/offsets/fill.mjs
function _a(e, t) {
	let n = e[e.length - 1];
	for (let r = 1; r <= t; r++) {
		let i = /* @__PURE__ */ F(0, t, r);
		e.push(Y(n, 1, i));
	}
}
// ../build-deps/node_modules/framer-motion/dist/es/utils/offsets/default.mjs
function va(e) {
	let t = [0];
	return _a(t, e.length - 1), t;
}
// ../build-deps/node_modules/framer-motion/dist/es/utils/offsets/time.mjs
function ya(e, t) {
	return e.map((e) => e * t);
}
// ../build-deps/node_modules/framer-motion/dist/es/animation/generators/keyframes.mjs
function ba(e, t) {
	return e.map(() => t || da).splice(0, e.length - 1);
}
function xa({ duration: e = 300, keyframes: t, times: n, ease: r = "easeInOut" }) {
	let i = fa(r) ? r.map(ma) : ma(r), a = {
		done: !1,
		value: t[0]
	}, o = ga(ya(n && n.length === t.length ? n : va(t), e), t, { ease: Array.isArray(i) ? i : ba(t, i) });
	return {
		calculatedDuration: e,
		next: (t) => (a.value = o(t), a.done = t >= e, a)
	};
}
// ../build-deps/node_modules/framer-motion/dist/es/animation/animators/drivers/driver-frameloop.mjs
var Sa = (e) => {
	let t = ({ timestamp: t }) => e(t);
	return {
		start: () => B.update(t, !0),
		stop: () => V(t),
		now: () => H.isProcessing ? H.timestamp : Bn.now()
	};
}, Ca = {
	decay: ca,
	inertia: ca,
	tween: xa,
	keyframes: xa,
	spring: sa
}, wa = (e) => e / 100, Ta = class extends Ai {
	constructor(e) {
		super(e), this.holdTime = null, this.cancelTime = null, this.currentTime = 0, this.playbackSpeed = 1, this.pendingPlayState = "running", this.startTime = null, this.state = "idle", this.stop = () => {
			if (this.resolver.cancel(), this.isStopped = !0, this.state === "idle") return;
			this.teardown();
			let { onStop: e } = this.options;
			e && e();
		};
		let { name: t, motionValue: n, element: r, keyframes: i } = this.options, a = r?.KeyframeResolver || Br, o = (e, t) => this.onKeyframesResolved(e, t);
		this.resolver = new a(i, o, t, n, r), this.resolver.scheduleResolve();
	}
	flatten() {
		super.flatten(), this._resolved && Object.assign(this._resolved, this.initPlayback(this._resolved.keyframes));
	}
	initPlayback(e) {
		let { type: t = "keyframes", repeat: n = 0, repeatDelay: r = 0, repeatType: i, velocity: a = 0 } = this.options, o = un(t) ? t : Ca[t] || xa, s, c;
		o !== xa && typeof e[0] != "number" && (process.env.NODE_ENV !== "production" && ne(e.length === 2, `Only two keyframes currently supported with spring and inertia animations. Trying to animate ${e}`), s = Bi(wa, Yi(e[0], e[1])), e = [0, 100]);
		let l = o({
			...this.options,
			keyframes: e
		});
		i === "mirror" && (c = o({
			...this.options,
			keyframes: [...e].reverse(),
			velocity: -a
		})), l.calculatedDuration === null && (l.calculatedDuration = ln(l));
		let { calculatedDuration: u } = l, d = u + r, f = d * (n + 1) - r;
		return {
			generator: l,
			mirroredGenerator: c,
			mapPercentToKeyframes: s,
			calculatedDuration: u,
			resolvedDuration: d,
			totalDuration: f
		};
	}
	onPostResolved() {
		let { autoplay: e = !0 } = this.options;
		this.play(), this.pendingPlayState === "paused" || !e ? this.pause() : this.state = this.pendingPlayState;
	}
	tick(e, t = !1) {
		let { resolved: n } = this;
		if (!n) {
			let { keyframes: e } = this.options;
			return {
				done: !0,
				value: e[e.length - 1]
			};
		}
		let { finalKeyframe: r, generator: i, mirroredGenerator: a, mapPercentToKeyframes: o, keyframes: s, calculatedDuration: c, totalDuration: l, resolvedDuration: u } = n;
		if (this.startTime === null) return i.next(0);
		let { delay: d, repeat: f, repeatType: p, repeatDelay: m, onUpdate: h } = this.options;
		this.speed > 0 ? this.startTime = Math.min(this.startTime, e) : this.speed < 0 && (this.startTime = Math.min(e - l / this.speed, this.startTime)), this.currentTime = t ? e : this.holdTime === null ? Math.round(e - this.startTime) * this.speed : this.holdTime;
		let g = this.currentTime - d * (this.speed >= 0 ? 1 : -1), _ = this.speed >= 0 ? g < 0 : g > l;
		this.currentTime = Math.max(g, 0), this.state === "finished" && this.holdTime === null && (this.currentTime = l);
		let v = this.currentTime, y = i;
		if (f) {
			let e = Math.min(this.currentTime, l) / u, t = Math.floor(e), n = e % 1;
			!n && e >= 1 && (n = 1), n === 1 && t--, t = Math.min(t, f + 1), t % 2 && (p === "reverse" ? (n = 1 - n, m && (n -= m / u)) : p === "mirror" && (y = a)), v = gt(0, 1, n) * u;
		}
		let b = _ ? {
			done: !1,
			value: s[0]
		} : y.next(v);
		o && (b.value = o(b.value));
		let { done: x } = b;
		!_ && c !== null && (x = this.speed >= 0 ? this.currentTime >= l : this.currentTime <= 0);
		let S = this.holdTime === null && (this.state === "finished" || this.state === "running" && x);
		return S && r !== void 0 && (b.value = Oi(s, this.options, r)), h && h(b.value), S && this.finish(), b;
	}
	get duration() {
		let { resolved: e } = this;
		return e ? /* @__PURE__ */ L(e.calculatedDuration) : 0;
	}
	get time() {
		return /* @__PURE__ */ L(this.currentTime);
	}
	set time(e) {
		e = /* @__PURE__ */ I(e), this.currentTime = e, this.holdTime !== null || this.speed === 0 ? this.holdTime = e : this.driver && (this.startTime = this.driver.now() - e / this.speed);
	}
	get speed() {
		return this.playbackSpeed;
	}
	set speed(e) {
		let t = this.playbackSpeed !== e;
		this.playbackSpeed = e, t && (this.time = /* @__PURE__ */ L(this.currentTime));
	}
	play() {
		if (this.resolver.isScheduled || this.resolver.resume(), !this._resolved) {
			this.pendingPlayState = "running";
			return;
		}
		if (this.isStopped) return;
		let { driver: e = Sa, onPlay: t, startTime: n } = this.options;
		this.driver ||= e((e) => this.tick(e)), t && t();
		let r = this.driver.now();
		this.holdTime === null ? this.startTime ? this.state === "finished" && (this.startTime = r) : this.startTime = n ?? this.calcStartTime() : this.startTime = r - this.holdTime, this.state === "finished" && this.updateFinishedPromise(), this.cancelTime = this.startTime, this.holdTime = null, this.state = "running", this.driver.start();
	}
	pause() {
		this._resolved ? (this.state = "paused", this.holdTime = this.currentTime ?? 0) : this.pendingPlayState = "paused";
	}
	complete() {
		this.state !== "running" && this.play(), this.pendingPlayState = this.state = "finished", this.holdTime = null;
	}
	finish() {
		this.teardown(), this.state = "finished";
		let { onComplete: e } = this.options;
		e && e();
	}
	cancel() {
		this.cancelTime !== null && this.tick(this.cancelTime), this.teardown(), this.updateFinishedPromise();
	}
	teardown() {
		this.state = "idle", this.stopDriver(), this.resolveFinishedPromise(), this.updateFinishedPromise(), this.startTime = this.cancelTime = null, this.resolver.cancel();
	}
	stopDriver() {
		this.driver &&= (this.driver.stop(), void 0);
	}
	sample(e) {
		return this.startTime = 0, this.tick(e, !0);
	}
}, Ea = /* @__PURE__ */ new Set([
	"opacity",
	"clipPath",
	"filter",
	"transform"
]);
// ../build-deps/node_modules/framer-motion/dist/es/animation/animators/waapi/index.mjs
function Da(e, t, n, { delay: r = 0, duration: i = 300, repeat: a = 0, repeatType: o = "loop", ease: s = "easeInOut", times: c } = {}) {
	let l = { [t]: n };
	c && (l.offset = c);
	let u = bn(s, i);
	return Array.isArray(u) && (l.easing = u), e.animate(l, {
		delay: r,
		duration: i,
		easing: Array.isArray(u) ? "linear" : u,
		fill: "both",
		iterations: a + 1,
		direction: o === "reverse" ? "alternate" : "normal"
	});
}
// ../build-deps/node_modules/framer-motion/dist/es/animation/animators/waapi/utils/supports-waapi.mjs
var Oa = /*@__PURE__*/ re(() => Object.hasOwnProperty.call(Element.prototype, "animate")), ka = 10, Aa = 2e4;
function ja(e) {
	return un(e.type) || e.type === "spring" || !_n(e.ease);
}
function Ma(e, t) {
	let n = new Ta({
		...t,
		keyframes: e,
		repeat: 0,
		delay: 0,
		isGenerator: !0
	}), r = {
		done: !1,
		value: e[0]
	}, i = [], a = 0;
	for (; !r.done && a < Aa;) r = n.sample(a), i.push(r.value), a += ka;
	return {
		times: void 0,
		keyframes: i,
		duration: a - ka,
		ease: "linear"
	};
}
var Na = {
	anticipate: fr,
	backInOut: dr,
	circInOut: hr
};
function Pa(e) {
	return e in Na;
}
var Fa = class extends Ai {
	constructor(e) {
		super(e);
		let { name: t, motionValue: n, element: r, keyframes: i } = this.options;
		this.resolver = new Ci(i, (e, t) => this.onKeyframesResolved(e, t), t, n, r), this.resolver.scheduleResolve();
	}
	initPlayback(e, t) {
		let { duration: n = 300, times: r, ease: i, type: a, motionValue: o, name: s, startTime: c } = this.options;
		if (!o.owner?.current) return !1;
		if (typeof i == "string" && hn() && Pa(i) && (i = Na[i]), ja(this.options)) {
			let { onComplete: t, onUpdate: o, motionValue: s, element: c, ...l } = this.options, u = Ma(e, l);
			e = u.keyframes, e.length === 1 && (e[1] = e[0]), n = u.duration, r = u.times, i = u.ease, a = "keyframes";
		}
		let l = Da(o.owner.current, s, e, {
			...this.options,
			duration: n,
			times: r,
			ease: i
		});
		return l.startTime = c ?? this.calcStartTime(), this.pendingTimeline ? (dn(l, this.pendingTimeline), this.pendingTimeline = void 0) : l.onfinish = () => {
			let { onComplete: n } = this.options;
			o.set(Oi(e, this.options, t)), n && n(), this.cancel(), this.resolveFinishedPromise();
		}, {
			animation: l,
			duration: n,
			times: r,
			type: a,
			ease: i,
			keyframes: e
		};
	}
	get duration() {
		let { resolved: e } = this;
		if (!e) return 0;
		let { duration: t } = e;
		return /* @__PURE__ */ L(t);
	}
	get time() {
		let { resolved: e } = this;
		if (!e) return 0;
		let { animation: t } = e;
		return /* @__PURE__ */ L(t.currentTime || 0);
	}
	set time(e) {
		let { resolved: t } = this;
		if (!t) return;
		let { animation: n } = t;
		n.currentTime = /* @__PURE__ */ I(e);
	}
	get speed() {
		let { resolved: e } = this;
		if (!e) return 1;
		let { animation: t } = e;
		return t.playbackRate;
	}
	set speed(e) {
		let { resolved: t } = this;
		if (!t) return;
		let { animation: n } = t;
		n.playbackRate = e;
	}
	get state() {
		let { resolved: e } = this;
		if (!e) return "idle";
		let { animation: t } = e;
		return t.playState;
	}
	get startTime() {
		let { resolved: e } = this;
		if (!e) return null;
		let { animation: t } = e;
		return t.startTime;
	}
	attachTimeline(e) {
		if (!this._resolved) this.pendingTimeline = e;
		else {
			let { resolved: t } = this;
			if (!t) return N;
			let { animation: n } = t;
			dn(n, e);
		}
		return N;
	}
	play() {
		if (this.isStopped) return;
		let { resolved: e } = this;
		if (!e) return;
		let { animation: t } = e;
		t.playState === "finished" && this.updateFinishedPromise(), t.play();
	}
	pause() {
		let { resolved: e } = this;
		if (!e) return;
		let { animation: t } = e;
		t.pause();
	}
	stop() {
		if (this.resolver.cancel(), this.isStopped = !0, this.state === "idle") return;
		this.resolveFinishedPromise(), this.updateFinishedPromise();
		let { resolved: e } = this;
		if (!e) return;
		let { animation: t, keyframes: n, duration: r, type: i, ease: a, times: o } = e;
		if (t.playState === "idle" || t.playState === "finished") return;
		if (this.time) {
			let { motionValue: e, onUpdate: t, onComplete: s, element: c, ...l } = this.options, u = new Ta({
				...l,
				keyframes: n,
				duration: r,
				type: i,
				ease: a,
				times: o,
				isGenerator: !0
			}), d = /* @__PURE__ */ I(this.time);
			e.setWithVelocity(u.sample(d - ka).value, u.sample(d).value, ka);
		}
		let { onStop: s } = this.options;
		s && s(), this.cancel();
	}
	complete() {
		let { resolved: e } = this;
		e && e.animation.finish();
	}
	cancel() {
		let { resolved: e } = this;
		e && e.animation.cancel();
	}
	static supports(e) {
		let { motionValue: t, name: n, repeatDelay: r, repeatType: i, damping: a, type: o } = e;
		return Oa() && n && Ea.has(n) && t && t.owner && t.owner.current instanceof HTMLElement && !t.owner.getProps().onUpdate && !r && i !== "mirror" && a !== 0 && o !== "inertia";
	}
}, Ia = {
	type: "spring",
	stiffness: 500,
	damping: 25,
	restSpeed: 10
}, La = (e) => ({
	type: "spring",
	stiffness: 550,
	damping: e === 0 ? 2 * Math.sqrt(550) : 30,
	restSpeed: 10
}), Ra = {
	type: "keyframes",
	duration: .8
}, za = {
	type: "keyframes",
	ease: [
		.25,
		.1,
		.35,
		1
	],
	duration: .3
}, Ba = (e, { keyframes: t }) => t.length > 2 ? Ra : et.has(e) ? e.startsWith("scale") ? La(t[1]) : Ia : za;
// ../build-deps/node_modules/framer-motion/dist/es/animation/utils/is-transition-defined.mjs
function Va({ when: e, delay: t, delayChildren: n, staggerChildren: r, staggerDirection: i, repeat: a, repeatType: o, repeatDelay: s, from: c, elapsed: l, ...u }) {
	return !!Object.keys(u).length;
}
// ../build-deps/node_modules/framer-motion/dist/es/animation/interfaces/motion-value.mjs
var Ha = (e, t, n, r = {}, i, a) => (o) => {
	let s = sn(r, e) || {}, c = s.delay || r.delay || 0, { elapsed: l = 0 } = r;
	l -= /* @__PURE__ */ I(c);
	let u = {
		keyframes: Array.isArray(n) ? n : [null, n],
		ease: "easeOut",
		velocity: t.getVelocity(),
		...s,
		delay: -l,
		onUpdate: (e) => {
			t.set(e), s.onUpdate && s.onUpdate(e);
		},
		onComplete: () => {
			o(), s.onComplete && s.onComplete();
		},
		name: e,
		motionValue: t,
		element: a ? void 0 : i
	};
	Va(s) || (u = {
		...u,
		...Ba(e, u)
	}), u.duration && (u.duration = /* @__PURE__ */ I(u.duration)), u.repeatDelay && (u.repeatDelay = /* @__PURE__ */ I(u.repeatDelay)), u.from !== void 0 && (u.keyframes[0] = u.from);
	let d = !1;
	if ((u.type === !1 || u.duration === 0 && !u.repeatDelay) && (u.duration = 0, u.delay === 0 && (d = !0)), (tr.current || z.skipAnimations) && (d = !0, u.duration = 0, u.delay = 0), d && !a && t.get() !== void 0) {
		let e = Oi(u.keyframes, s);
		if (e !== void 0) return B.update(() => {
			u.onUpdate(e), u.onComplete();
		}), new on([]);
	}
	return !a && Fa.supports(u) ? new Fa(u) : new Ta(u);
};
// ../build-deps/node_modules/framer-motion/dist/es/animation/interfaces/visual-element-target.mjs
function Ua({ protectedKeys: e, needsAnimating: t }, n) {
	let r = e.hasOwnProperty(n) && t[n] !== !0;
	return t[n] = !1, r;
}
function Wa(e, t, { delay: n = 0, transitionOverride: r, type: i } = {}) {
	let { transition: a = e.getDefaultTransition(), transitionEnd: o, ...s } = t;
	r && (a = r);
	let c = [], l = i && e.animationState && e.animationState.getState()[i];
	for (let t in s) {
		let r = e.getValue(t, e.latestValues[t] ?? null), i = s[t];
		if (i === void 0 || l && Ua(l, t)) continue;
		let o = {
			delay: n,
			...sn(a || {}, t)
		}, u = !1;
		if (window.MotionHandoffAnimation) {
			let n = er(e);
			if (n) {
				let e = window.MotionHandoffAnimation(n, t, B);
				e !== null && (o.startTime = e, u = !0);
			}
		}
		$n(e, t), r.start(Ha(t, r, i, e.shouldReduceMotion && et.has(t) ? { type: !1 } : o, e, u));
		let d = r.animation;
		d && c.push(d);
	}
	return o && Promise.all(c).then(() => {
		B.update(() => {
			o && Zn(e, o);
		});
	}), c;
}
// ../build-deps/node_modules/framer-motion/dist/es/animation/interfaces/visual-element-variant.mjs
function Ga(e, t, n = {}) {
	let r = nn(e, t, n.type === "exit" ? e.presenceContext?.custom : void 0), { transition: i = e.getDefaultTransition() || {} } = r || {};
	n.transitionOverride && (i = n.transitionOverride);
	let a = r ? () => Promise.all(Wa(e, r, n)) : () => Promise.resolve(), o = e.variantChildren && e.variantChildren.size ? (r = 0) => {
		let { delayChildren: a = 0, staggerChildren: o, staggerDirection: s } = i;
		return Ka(e, t, a + r, o, s, n);
	} : () => Promise.resolve(), { when: s } = i;
	if (s) {
		let [e, t] = s === "beforeChildren" ? [a, o] : [o, a];
		return e().then(() => t());
	}
	return Promise.all([a(), o(n.delay)]);
}
function Ka(e, t, n = 0, r = 0, i = 1, a) {
	let o = [], s = (e.variantChildren.size - 1) * r, c = i === 1 ? (e = 0) => e * r : (e = 0) => s - e * r;
	return Array.from(e.variantChildren).sort(qa).forEach((e, r) => {
		e.notify("AnimationStart", t), o.push(Ga(e, t, {
			...a,
			delay: n + c(r)
		}).then(() => e.notify("AnimationComplete", t)));
	}), Promise.all(o);
}
function qa(e, t) {
	return e.sortNodePosition(t);
}
// ../build-deps/node_modules/framer-motion/dist/es/animation/interfaces/visual-element.mjs
function Ja(e, t, n = {}) {
	e.notify("AnimationStart", t);
	let r;
	if (Array.isArray(t)) {
		let i = t.map((t) => Ga(e, t, n));
		r = Promise.all(i);
	} else if (typeof t == "string") r = Ga(e, t, n);
	else {
		let i = typeof t == "function" ? nn(e, t, n.custom) : t;
		r = Promise.all(Wa(e, i, n));
	}
	return r.then(() => {
		e.notify("AnimationComplete", t);
	});
}
// ../build-deps/node_modules/framer-motion/dist/es/render/utils/get-variant-context.mjs
var Ya = we.length;
function Xa(e) {
	if (!e) return;
	if (!e.isControllingVariants) {
		let t = e.parent && Xa(e.parent) || {};
		return e.props.initial !== void 0 && (t.initial = e.props.initial), t;
	}
	let t = {};
	for (let n = 0; n < Ya; n++) {
		let r = we[n], i = e.props[r];
		(xe(i) || i === !1) && (t[r] = i);
	}
	return t;
}
// ../build-deps/node_modules/framer-motion/dist/es/render/utils/animation-state.mjs
var Za = [...Ce].reverse(), Qa = Ce.length;
function $a(e) {
	return (t) => Promise.all(t.map(({ animation: t, options: n }) => Ja(e, t, n)));
}
function eo(e) {
	let t = $a(e), n = ro(), r = !0, i = (t) => (n, r) => {
		let i = nn(e, r, t === "exit" ? e.presenceContext?.custom : void 0);
		if (i) {
			let { transition: e, transitionEnd: t, ...r } = i;
			n = {
				...n,
				...r,
				...t
			};
		}
		return n;
	};
	function a(n) {
		t = n(e);
	}
	function o(a) {
		let { props: o } = e, s = Xa(e.parent) || {}, c = [], l = /* @__PURE__ */ new Set(), u = {}, d = Infinity;
		for (let t = 0; t < Qa; t++) {
			let f = Za[t], p = n[f], m = o[f] === void 0 ? s[f] : o[f], h = xe(m), g = f === a ? p.isActive : null;
			g === !1 && (d = t);
			let _ = m === s[f] && m !== o[f] && h;
			if (_ && r && e.manuallyAnimateOnMount && (_ = !1), p.protectedKeys = { ...u }, !p.isActive && g === null || !m && !p.prevProp || Se(m) || typeof m == "boolean") continue;
			let v = to(p.prevProp, m), y = v || f === a && p.isActive && !_ && h || t > d && h, b = !1, x = Array.isArray(m) ? m : [m], S = x.reduce(i(f), {});
			g === !1 && (S = {});
			let { prevResolvedValues: C = {} } = p, w = {
				...C,
				...S
			}, T = (t) => {
				y = !0, l.has(t) && (b = !0, l.delete(t)), p.needsAnimating[t] = !0;
				let n = e.getValue(t);
				n && (n.liveStyle = !1);
			};
			for (let e in w) {
				let t = S[e], n = C[e];
				if (u.hasOwnProperty(e)) continue;
				let r = !1;
				r = ot(t) && ot(n) ? !tn(t, n) : t !== n, r ? t == null ? l.add(e) : T(e) : t !== void 0 && l.has(e) ? T(e) : p.protectedKeys[e] = !0;
			}
			p.prevProp = m, p.prevResolvedValues = S, p.isActive && (u = {
				...u,
				...S
			}), r && e.blockInitialAnimation && (y = !1), y && (!(_ && v) || b) && c.push(...x.map((e) => ({
				animation: e,
				options: { type: f }
			})));
		}
		if (l.size) {
			let t = {};
			l.forEach((n) => {
				let r = e.getBaseTarget(n), i = e.getValue(n);
				i && (i.liveStyle = !0), t[n] = r ?? null;
			}), c.push({ animation: t });
		}
		let f = !!c.length;
		return r && (o.initial === !1 || o.initial === o.animate) && !e.manuallyAnimateOnMount && (f = !1), r = !1, f ? t(c) : Promise.resolve();
	}
	function s(t, r) {
		var i;
		if (n[t].isActive === r) return Promise.resolve();
		(i = e.variantChildren) == null || i.forEach((e) => e.animationState?.setActive(t, r)), n[t].isActive = r;
		let a = o(t);
		for (let e in n) n[e].protectedKeys = {};
		return a;
	}
	return {
		animateChanges: o,
		setActive: s,
		setAnimateFunction: a,
		getState: () => n,
		reset: () => {
			n = ro(), r = !0;
		}
	};
}
function to(e, t) {
	return typeof t == "string" ? t !== e : Array.isArray(t) ? !tn(t, e) : !1;
}
function no(e = !1) {
	return {
		isActive: e,
		protectedKeys: {},
		needsAnimating: {},
		prevResolvedValues: {}
	};
}
function ro() {
	return {
		animate: no(!0),
		whileInView: no(),
		whileHover: no(),
		whileTap: no(),
		whileDrag: no(),
		whileFocus: no(),
		exit: no()
	};
}
// ../build-deps/node_modules/framer-motion/dist/es/motion/features/Feature.mjs
var io = class {
	constructor(e) {
		this.isMounted = !1, this.node = e;
	}
	update() {}
}, ao = class extends io {
	constructor(e) {
		super(e), e.animationState ||= eo(e);
	}
	updateAnimationControlsSubscription() {
		let { animate: e } = this.node.getProps();
		Se(e) && (this.unmountControls = e.subscribe(this.node));
	}
	mount() {
		this.updateAnimationControlsSubscription();
	}
	update() {
		let { animate: e } = this.node.getProps(), { animate: t } = this.node.prevProps || {};
		e !== t && this.updateAnimationControlsSubscription();
	}
	unmount() {
		var e;
		this.node.animationState.reset(), (e = this.unmountControls) == null || e.call(this);
	}
}, oo = 0, so = {
	animation: { Feature: ao },
	exit: { Feature: class extends io {
		constructor() {
			super(...arguments), this.id = oo++;
		}
		update() {
			if (!this.node.presenceContext) return;
			let { isPresent: e, onExitComplete: t } = this.node.presenceContext, { isPresent: n } = this.node.prevPresenceContext || {};
			if (!this.node.animationState || e === n) return;
			let r = this.node.animationState.setActive("exit", !e);
			t && !e && r.then(() => t(this.id));
		}
		mount() {
			let { register: e } = this.node.presenceContext || {};
			e && (this.unmount = e(this.id));
		}
		unmount() {}
	} }
};
// ../build-deps/node_modules/framer-motion/dist/es/events/add-dom-event.mjs
function co(e, t, n, r = { passive: !0 }) {
	return e.addEventListener(t, n, r), () => e.removeEventListener(t, n);
}
// ../build-deps/node_modules/framer-motion/dist/es/events/event-info.mjs
function lo(e) {
	return { point: {
		x: e.pageX,
		y: e.pageY
	} };
}
var uo = (e) => (t) => On(t) && e(t, lo(t));
// ../build-deps/node_modules/framer-motion/dist/es/events/add-pointer-event.mjs
function fo(e, t, n, r) {
	return co(e, t, uo(n), r);
}
// ../build-deps/node_modules/framer-motion/dist/es/utils/distance.mjs
var po = (e, t) => Math.abs(e - t);
function mo(e, t) {
	let n = po(e.x, t.x), r = po(e.y, t.y);
	return Math.sqrt(n ** 2 + r ** 2);
}
// ../build-deps/node_modules/framer-motion/dist/es/gestures/pan/PanSession.mjs
var ho = class {
	constructor(e, t, { transformPagePoint: n, contextWindow: r, dragSnapToOrigin: i = !1 } = {}) {
		if (this.startEvent = null, this.lastMoveEvent = null, this.lastMoveEventInfo = null, this.handlers = {}, this.contextWindow = window, this.updatePoint = () => {
			if (!(this.lastMoveEvent && this.lastMoveEventInfo)) return;
			let e = vo(this.lastMoveEventInfo, this.history), t = this.startEvent !== null, n = mo(e.offset, {
				x: 0,
				y: 0
			}) >= 3;
			if (!t && !n) return;
			let { point: r } = e, { timestamp: i } = H;
			this.history.push({
				...r,
				timestamp: i
			});
			let { onStart: a, onMove: o } = this.handlers;
			t || (a && a(this.lastMoveEvent, e), this.startEvent = this.lastMoveEvent), o && o(this.lastMoveEvent, e);
		}, this.handlePointerMove = (e, t) => {
			this.lastMoveEvent = e, this.lastMoveEventInfo = go(t, this.transformPagePoint), B.update(this.updatePoint, !0);
		}, this.handlePointerUp = (e, t) => {
			this.end();
			let { onEnd: n, onSessionEnd: r, resumeAnimation: i } = this.handlers;
			if (this.dragSnapToOrigin && i && i(), !(this.lastMoveEvent && this.lastMoveEventInfo)) return;
			let a = vo(e.type === "pointercancel" ? this.lastMoveEventInfo : go(t, this.transformPagePoint), this.history);
			this.startEvent && n && n(e, a), r && r(e, a);
		}, !On(e)) return;
		this.dragSnapToOrigin = i, this.handlers = t, this.transformPagePoint = n, this.contextWindow = r || window;
		let a = go(lo(e), this.transformPagePoint), { point: o } = a, { timestamp: s } = H;
		this.history = [{
			...o,
			timestamp: s
		}];
		let { onSessionStart: c } = t;
		c && c(e, vo(a, this.history)), this.removeListeners = Bi(fo(this.contextWindow, "pointermove", this.handlePointerMove), fo(this.contextWindow, "pointerup", this.handlePointerUp), fo(this.contextWindow, "pointercancel", this.handlePointerUp));
	}
	updateHandlers(e) {
		this.handlers = e;
	}
	end() {
		this.removeListeners && this.removeListeners(), V(this.updatePoint);
	}
};
function go(e, t) {
	return t ? { point: t(e.point) } : e;
}
function _o(e, t) {
	return {
		x: e.x - t.x,
		y: e.y - t.y
	};
}
function vo({ point: e }, t) {
	return {
		point: e,
		delta: _o(e, bo(t)),
		offset: _o(e, yo(t)),
		velocity: xo(t, .1)
	};
}
function yo(e) {
	return e[0];
}
function bo(e) {
	return e[e.length - 1];
}
function xo(e, t) {
	if (e.length < 2) return {
		x: 0,
		y: 0
	};
	let n = e.length - 1, r = null, i = bo(e);
	for (; n >= 0 && (r = e[n], !(i.timestamp - r.timestamp > /* @__PURE__ */ I(t)));) n--;
	if (!r) return {
		x: 0,
		y: 0
	};
	let a = /* @__PURE__ */ L(i.timestamp - r.timestamp);
	if (a === 0) return {
		x: 0,
		y: 0
	};
	let o = {
		x: (i.x - r.x) / a,
		y: (i.y - r.y) / a
	};
	return o.x === Infinity && (o.x = 0), o.y === Infinity && (o.y = 0), o;
}
// ../build-deps/node_modules/framer-motion/dist/es/projection/geometry/delta-calc.mjs
var So = .9999, Co = 1.0001, wo = -.01, To = .01;
function Eo(e) {
	return e.max - e.min;
}
function Do(e, t, n) {
	return Math.abs(e - t) <= n;
}
function Oo(e, t, n, r = .5) {
	e.origin = r, e.originPoint = Y(t.min, t.max, e.origin), e.scale = Eo(n) / Eo(t), e.translate = Y(n.min, n.max, e.origin) - e.originPoint, (e.scale >= So && e.scale <= Co || isNaN(e.scale)) && (e.scale = 1), (e.translate >= wo && e.translate <= To || isNaN(e.translate)) && (e.translate = 0);
}
function ko(e, t, n, r) {
	Oo(e.x, t.x, n.x, r ? r.originX : void 0), Oo(e.y, t.y, n.y, r ? r.originY : void 0);
}
function Ao(e, t, n) {
	e.min = n.min + t.min, e.max = e.min + Eo(t);
}
function jo(e, t, n) {
	Ao(e.x, t.x, n.x), Ao(e.y, t.y, n.y);
}
function Mo(e, t, n) {
	e.min = t.min - n.min, e.max = e.min + Eo(t);
}
function No(e, t, n) {
	Mo(e.x, t.x, n.x), Mo(e.y, t.y, n.y);
}
// ../build-deps/node_modules/framer-motion/dist/es/gestures/drag/utils/constraints.mjs
function Po(e, { min: t, max: n }, r) {
	return t !== void 0 && e < t ? e = r ? Y(t, e, r.min) : Math.max(e, t) : n !== void 0 && e > n && (e = r ? Y(n, e, r.max) : Math.min(e, n)), e;
}
function Fo(e, t, n) {
	return {
		min: t === void 0 ? void 0 : e.min + t,
		max: n === void 0 ? void 0 : e.max + n - (e.max - e.min)
	};
}
function Io(e, { top: t, left: n, bottom: r, right: i }) {
	return {
		x: Fo(e.x, n, i),
		y: Fo(e.y, t, r)
	};
}
function Lo(e, t) {
	let n = t.min - e.min, r = t.max - e.max;
	return t.max - t.min < e.max - e.min && ([n, r] = [r, n]), {
		min: n,
		max: r
	};
}
function Ro(e, t) {
	return {
		x: Lo(e.x, t.x),
		y: Lo(e.y, t.y)
	};
}
function zo(e, t) {
	let n = .5, r = Eo(e), i = Eo(t);
	return i > r ? n = /* @__PURE__ */ F(t.min, t.max - r, e.min) : r > i && (n = /* @__PURE__ */ F(e.min, e.max - i, t.min)), gt(0, 1, n);
}
function Bo(e, t) {
	let n = {};
	return t.min !== void 0 && (n.min = t.min - e.min), t.max !== void 0 && (n.max = t.max - e.min), n;
}
var Vo = .35;
function Ho(e = Vo) {
	return e === !1 ? e = 0 : e === !0 && (e = Vo), {
		x: Uo(e, "left", "right"),
		y: Uo(e, "top", "bottom")
	};
}
function Uo(e, t, n) {
	return {
		min: Wo(e, t),
		max: Wo(e, n)
	};
}
function Wo(e, t) {
	return typeof e == "number" ? e : e[t] || 0;
}
// ../build-deps/node_modules/framer-motion/dist/es/projection/geometry/models.mjs
var Go = () => ({
	translate: 0,
	scale: 1,
	origin: 0,
	originPoint: 0
}), Ko = () => ({
	x: Go(),
	y: Go()
}), qo = () => ({
	min: 0,
	max: 0
}), Z = () => ({
	x: qo(),
	y: qo()
});
// ../build-deps/node_modules/framer-motion/dist/es/projection/utils/each-axis.mjs
function Jo(e) {
	return [e("x"), e("y")];
}
// ../build-deps/node_modules/framer-motion/dist/es/projection/geometry/conversion.mjs
function Yo({ top: e, left: t, right: n, bottom: r }) {
	return {
		x: {
			min: t,
			max: n
		},
		y: {
			min: e,
			max: r
		}
	};
}
function Xo({ x: e, y: t }) {
	return {
		top: t.min,
		right: e.max,
		bottom: t.max,
		left: e.min
	};
}
function Zo(e, t) {
	if (!t) return e;
	let n = t({
		x: e.left,
		y: e.top
	}), r = t({
		x: e.right,
		y: e.bottom
	});
	return {
		top: n.y,
		left: n.x,
		bottom: r.y,
		right: r.x
	};
}
// ../build-deps/node_modules/framer-motion/dist/es/projection/utils/has-transform.mjs
function Qo(e) {
	return e === void 0 || e === 1;
}
function $o({ scale: e, scaleX: t, scaleY: n }) {
	return !Qo(e) || !Qo(t) || !Qo(n);
}
function es(e) {
	return $o(e) || ts(e) || e.z || e.rotate || e.rotateX || e.rotateY || e.skewX || e.skewY;
}
function ts(e) {
	return ns(e.x) || ns(e.y);
}
function ns(e) {
	return e && e !== "0%";
}
// ../build-deps/node_modules/framer-motion/dist/es/projection/geometry/delta-apply.mjs
function rs(e, t, n) {
	return n + t * (e - n);
}
function is(e, t, n, r, i) {
	return i !== void 0 && (e = rs(e, i, r)), rs(e, n, r) + t;
}
function as(e, t = 0, n = 1, r, i) {
	e.min = is(e.min, t, n, r, i), e.max = is(e.max, t, n, r, i);
}
function os(e, { x: t, y: n }) {
	as(e.x, t.translate, t.scale, t.originPoint), as(e.y, n.translate, n.scale, n.originPoint);
}
var ss = .999999999999, cs = 1.0000000000001;
function ls(e, t, n, r = !1) {
	let i = n.length;
	if (!i) return;
	t.x = t.y = 1;
	let a, o;
	for (let s = 0; s < i; s++) {
		a = n[s], o = a.projectionDelta;
		let { visualElement: i } = a.options;
		i && i.props.style && i.props.style.display === "contents" || (r && a.options.layoutScroll && a.scroll && a !== a.root && fs(e, {
			x: -a.scroll.offset.x,
			y: -a.scroll.offset.y
		}), o && (t.x *= o.x.scale, t.y *= o.y.scale, os(e, o)), r && es(a.latestValues) && fs(e, a.latestValues));
	}
	t.x < cs && t.x > ss && (t.x = 1), t.y < cs && t.y > ss && (t.y = 1);
}
function us(e, t) {
	e.min += t, e.max += t;
}
function ds(e, t, n, r, i = .5) {
	as(e, t, n, Y(e.min, e.max, i), r);
}
function fs(e, t) {
	ds(e.x, t.x, t.scaleX, t.scale, t.originX), ds(e.y, t.y, t.scaleY, t.scale, t.originY);
}
// ../build-deps/node_modules/framer-motion/dist/es/projection/utils/measure.mjs
function ps(e, t) {
	return Yo(Zo(e.getBoundingClientRect(), t));
}
function ms(e, t, n) {
	let r = ps(e, n), { scroll: i } = t;
	return i && (us(r.x, i.offset.x), us(r.y, i.offset.y)), r;
}
// ../build-deps/node_modules/framer-motion/dist/es/utils/get-context-window.mjs
var hs = ({ current: e }) => e ? e.ownerDocument.defaultView : null, gs = /* @__PURE__ */ new WeakMap(), _s = class {
	constructor(e) {
		this.openDragLock = null, this.isDragging = !1, this.currentDirection = null, this.originPoint = {
			x: 0,
			y: 0
		}, this.constraints = !1, this.hasMutatedConstraints = !1, this.elastic = Z(), this.visualElement = e;
	}
	start(e, { snapToCursor: t = !1 } = {}) {
		let { presenceContext: n } = this.visualElement;
		if (n && n.isPresent === !1) return;
		let r = (e) => {
			let { dragSnapToOrigin: n } = this.getProps();
			n ? this.pauseAnimation() : this.stopAnimation(), t && this.snapToCursor(lo(e).point);
		}, i = (e, t) => {
			let { drag: n, dragPropagation: r, onDragStart: i } = this.getProps();
			if (n && !r && (this.openDragLock && this.openDragLock(), this.openDragLock = Ln(n), !this.openDragLock)) return;
			this.isDragging = !0, this.currentDirection = null, this.resolveConstraints(), this.visualElement.projection && (this.visualElement.projection.isAnimationBlocked = !0, this.visualElement.projection.target = void 0), Jo((e) => {
				let t = this.getAxisMotionValue(e).get() || 0;
				if (St.test(t)) {
					let { projection: n } = this.visualElement;
					if (n && n.layout) {
						let r = n.layout.layoutBox[e];
						r && (t = Eo(r) * (parseFloat(t) / 100));
					}
				}
				this.originPoint[e] = t;
			}), i && B.postRender(() => i(e, t)), $n(this.visualElement, "transform");
			let { animationState: a } = this.visualElement;
			a && a.setActive("whileDrag", !0);
		}, a = (e, t) => {
			let { dragPropagation: n, dragDirectionLock: r, onDirectionLock: i, onDrag: a } = this.getProps();
			if (!n && !this.openDragLock) return;
			let { offset: o } = t;
			r && this.currentDirection === null ? (this.currentDirection = ys(o), this.currentDirection !== null && i && i(this.currentDirection)) : (this.updateAxis("x", t.point, o), this.updateAxis("y", t.point, o), this.visualElement.render(), a && a(e, t));
		}, o = (e, t) => this.stop(e, t), s = () => Jo((e) => this.getAnimationState(e) === "paused" && this.getAxisMotionValue(e).animation?.play()), { dragSnapToOrigin: c } = this.getProps();
		this.panSession = new ho(e, {
			onSessionStart: r,
			onStart: i,
			onMove: a,
			onSessionEnd: o,
			resumeAnimation: s
		}, {
			transformPagePoint: this.visualElement.getTransformPagePoint(),
			dragSnapToOrigin: c,
			contextWindow: hs(this.visualElement)
		});
	}
	stop(e, t) {
		let n = this.isDragging;
		if (this.cancel(), !n) return;
		let { velocity: r } = t;
		this.startAnimation(r);
		let { onDragEnd: i } = this.getProps();
		i && B.postRender(() => i(e, t));
	}
	cancel() {
		this.isDragging = !1;
		let { projection: e, animationState: t } = this.visualElement;
		e && (e.isAnimationBlocked = !1), this.panSession && this.panSession.end(), this.panSession = void 0;
		let { dragPropagation: n } = this.getProps();
		!n && this.openDragLock && (this.openDragLock(), this.openDragLock = null), t && t.setActive("whileDrag", !1);
	}
	updateAxis(e, t, n) {
		let { drag: r } = this.getProps();
		if (!n || !vs(e, r, this.currentDirection)) return;
		let i = this.getAxisMotionValue(e), a = this.originPoint[e] + n[e];
		this.constraints && this.constraints[e] && (a = Po(a, this.constraints[e], this.elastic[e])), i.set(a);
	}
	resolveConstraints() {
		let { dragConstraints: e, dragElastic: t } = this.getProps(), n = this.visualElement.projection && !this.visualElement.projection.layout ? this.visualElement.projection.measure(!1) : this.visualElement.projection?.layout, r = this.constraints;
		e && je(e) ? this.constraints ||= this.resolveRefConstraints() : this.constraints = e && n ? Io(n.layoutBox, e) : !1, this.elastic = Ho(t), r !== this.constraints && n && this.constraints && !this.hasMutatedConstraints && Jo((e) => {
			this.constraints !== !1 && this.getAxisMotionValue(e) && (this.constraints[e] = Bo(n.layoutBox[e], this.constraints[e]));
		});
	}
	resolveRefConstraints() {
		let { dragConstraints: e, onMeasureDragConstraints: t } = this.getProps();
		if (!e || !je(e)) return !1;
		let n = e.current;
		ne(n !== null, "If `dragConstraints` is set as a React ref, that ref must be passed to another component's `ref` prop.");
		let { projection: r } = this.visualElement;
		if (!r || !r.layout) return !1;
		let i = ms(n, r.root, this.visualElement.getTransformPagePoint()), a = Ro(r.layout.layoutBox, i);
		if (t) {
			let e = t(Xo(a));
			this.hasMutatedConstraints = !!e, e && (a = Yo(e));
		}
		return a;
	}
	startAnimation(e) {
		let { drag: t, dragMomentum: n, dragElastic: r, dragTransition: i, dragSnapToOrigin: a, onDragTransitionEnd: o } = this.getProps(), s = this.constraints || {}, c = Jo((o) => {
			if (!vs(o, t, this.currentDirection)) return;
			let c = s && s[o] || {};
			a && (c = {
				min: 0,
				max: 0
			});
			let l = r ? 200 : 1e6, u = r ? 40 : 1e7, d = {
				type: "inertia",
				velocity: n ? e[o] : 0,
				bounceStiffness: l,
				bounceDamping: u,
				timeConstant: 750,
				restDelta: 1,
				restSpeed: 10,
				...i,
				...c
			};
			return this.startAxisValueAnimation(o, d);
		});
		return Promise.all(c).then(o);
	}
	startAxisValueAnimation(e, t) {
		let n = this.getAxisMotionValue(e);
		return $n(this.visualElement, e), n.start(Ha(e, n, 0, t, this.visualElement, !1));
	}
	stopAnimation() {
		Jo((e) => this.getAxisMotionValue(e).stop());
	}
	pauseAnimation() {
		Jo((e) => this.getAxisMotionValue(e).animation?.pause());
	}
	getAnimationState(e) {
		return this.getAxisMotionValue(e).animation?.state;
	}
	getAxisMotionValue(e) {
		let t = `_drag${e.toUpperCase()}`, n = this.visualElement.getProps();
		return n[t] || this.visualElement.getValue(e, (n.initial ? n.initial[e] : void 0) || 0);
	}
	snapToCursor(e) {
		Jo((t) => {
			let { drag: n } = this.getProps();
			if (!vs(t, n, this.currentDirection)) return;
			let { projection: r } = this.visualElement, i = this.getAxisMotionValue(t);
			if (r && r.layout) {
				let { min: n, max: a } = r.layout.layoutBox[t];
				i.set(e[t] - Y(n, a, .5));
			}
		});
	}
	scalePositionWithinConstraints() {
		if (!this.visualElement.current) return;
		let { drag: e, dragConstraints: t } = this.getProps(), { projection: n } = this.visualElement;
		if (!je(t) || !n || !this.constraints) return;
		this.stopAnimation();
		let r = {
			x: 0,
			y: 0
		};
		Jo((e) => {
			let t = this.getAxisMotionValue(e);
			if (t && this.constraints !== !1) {
				let n = t.get();
				r[e] = zo({
					min: n,
					max: n
				}, this.constraints[e]);
			}
		});
		let { transformTemplate: i } = this.visualElement.getProps();
		this.visualElement.current.style.transform = i ? i({}, "") : "none", n.root && n.root.updateScroll(), n.updateLayout(), this.resolveConstraints(), Jo((t) => {
			if (!vs(t, e, null)) return;
			let n = this.getAxisMotionValue(t), { min: i, max: a } = this.constraints[t];
			n.set(Y(i, a, r[t]));
		});
	}
	addListeners() {
		if (!this.visualElement.current) return;
		gs.set(this.visualElement, this);
		let e = this.visualElement.current, t = fo(e, "pointerdown", (e) => {
			let { drag: t, dragListener: n = !0 } = this.getProps();
			t && n && this.start(e);
		}), n = () => {
			let { dragConstraints: e } = this.getProps();
			je(e) && e.current && (this.constraints = this.resolveRefConstraints());
		}, { projection: r } = this.visualElement, i = r.addEventListener("measure", n);
		r && !r.layout && (r.root && r.root.updateScroll(), r.updateLayout()), B.read(n);
		let a = co(window, "resize", () => this.scalePositionWithinConstraints()), o = r.addEventListener("didUpdate", (({ delta: e, hasLayoutChanged: t }) => {
			this.isDragging && t && (Jo((t) => {
				let n = this.getAxisMotionValue(t);
				n && (this.originPoint[t] += e[t].translate, n.set(n.get() + e[t].translate));
			}), this.visualElement.render());
		}));
		return () => {
			a(), t(), i(), o && o();
		};
	}
	getProps() {
		let e = this.visualElement.getProps(), { drag: t = !1, dragDirectionLock: n = !1, dragPropagation: r = !1, dragConstraints: i = !1, dragElastic: a = Vo, dragMomentum: o = !0 } = e;
		return {
			...e,
			drag: t,
			dragDirectionLock: n,
			dragPropagation: r,
			dragConstraints: i,
			dragElastic: a,
			dragMomentum: o
		};
	}
};
function vs(e, t, n) {
	return (t === !0 || t === e) && (n === null || n === e);
}
function ys(e, t = 10) {
	let n = null;
	return Math.abs(e.y) > t ? n = "y" : Math.abs(e.x) > t && (n = "x"), n;
}
// ../build-deps/node_modules/framer-motion/dist/es/gestures/drag/index.mjs
var bs = class extends io {
	constructor(e) {
		super(e), this.removeGroupControls = N, this.removeListeners = N, this.controls = new _s(e);
	}
	mount() {
		let { dragControls: e } = this.node.getProps();
		e && (this.removeGroupControls = e.subscribe(this.controls)), this.removeListeners = this.controls.addListeners() || N;
	}
	unmount() {
		this.removeGroupControls(), this.removeListeners();
	}
}, xs = (e) => (t, n) => {
	e && B.postRender(() => e(t, n));
}, Ss = class extends io {
	constructor() {
		super(...arguments), this.removePointerDownListener = N;
	}
	onPointerDown(e) {
		this.session = new ho(e, this.createPanHandlers(), {
			transformPagePoint: this.node.getTransformPagePoint(),
			contextWindow: hs(this.node)
		});
	}
	createPanHandlers() {
		let { onPanSessionStart: e, onPanStart: t, onPan: n, onPanEnd: r } = this.node.getProps();
		return {
			onSessionStart: xs(e),
			onStart: xs(t),
			onMove: n,
			onEnd: (e, t) => {
				delete this.session, r && B.postRender(() => r(e, t));
			}
		};
	}
	mount() {
		this.removePointerDownListener = fo(this.node.current, "pointerdown", (e) => this.onPointerDown(e));
	}
	update() {
		this.session && this.session.updateHandlers(this.createPanHandlers());
	}
	unmount() {
		this.removePointerDownListener(), this.session && this.session.end();
	}
};
// ../build-deps/node_modules/framer-motion/dist/es/components/AnimatePresence/use-presence.mjs
function Cs() {
	let e = c(k);
	if (e === null) return [!0, null];
	let { isPresent: t, onExitComplete: n, register: r } = e, i = u();
	l(() => r(i), []);
	let a = s(() => n && n(i), [i, n]);
	return !t && n ? [!1, a] : [!0];
}
// ../build-deps/node_modules/framer-motion/dist/es/projection/node/state.mjs
var ws = {
	hasAnimatedSinceResize: !0,
	hasEverUpdated: !1
};
// ../build-deps/node_modules/framer-motion/dist/es/projection/styles/scale-border-radius.mjs
function Ts(e, t) {
	return t.max === t.min ? 0 : e / (t.max - t.min) * 100;
}
var Es = { correct: (e, t) => {
	if (!t.target) return e;
	if (typeof e == "string") {
		if (J.test(e)) e = parseFloat(e);
		else return e;
	}
	return `${Ts(e, t.target.x)}% ${Ts(e, t.target.y)}%`;
} }, Ds = { correct: (e, { treeScale: t, projectionDelta: n }) => {
	let r = e, i = pi.parse(e);
	if (i.length > 5) return r;
	let a = pi.createTransformer(e), o = typeof i[0] == "number" ? 0 : 1, s = n.x.scale * t.x, c = n.y.scale * t.y;
	i[0 + o] /= s, i[1 + o] /= c;
	let l = Y(s, c, .5);
	return typeof i[2 + o] == "number" && (i[2 + o] /= l), typeof i[3 + o] == "number" && (i[3 + o] /= l), a(i);
} }, Os = class extends n {
	componentDidMount() {
		let { visualElement: e, layoutGroup: t, switchLayoutGroup: n, layoutId: r } = this.props, { projection: i } = e;
		Qe(As), i && (t.group && t.group.add(i), n && n.register && r && n.register(i), i.root.didUpdate(), i.addEventListener("animationComplete", () => {
			this.safeToRemove();
		}), i.setOptions({
			...i.options,
			onExitComplete: () => this.safeToRemove()
		})), ws.hasEverUpdated = !0;
	}
	getSnapshotBeforeUpdate(e) {
		let { layoutDependency: t, visualElement: n, drag: r, isPresent: i } = this.props, a = n.projection;
		return a && (a.isPresent = i, r || e.layoutDependency !== t || t === void 0 ? a.willUpdate() : this.safeToRemove(), e.isPresent !== i && (i ? a.promote() : a.relegate() || B.postRender(() => {
			let e = a.getStack();
			e && e.members.length || this.safeToRemove();
		}))), null;
	}
	componentDidUpdate() {
		let { projection: e } = this.props.visualElement;
		e && (e.root.didUpdate(), Fe.postRender(() => {
			!e.currentAnimation && e.isLead() && this.safeToRemove();
		}));
	}
	componentWillUnmount() {
		let { visualElement: e, layoutGroup: t, switchLayoutGroup: n } = this.props, { projection: r } = e;
		r && (r.scheduleCheckAfterUnmount(), t && t.group && t.group.remove(r), n && n.deregister && n.deregister(r));
	}
	safeToRemove() {
		let { safeToRemove: e } = this.props;
		e && e();
	}
	render() {
		return null;
	}
};
function ks(e) {
	let [t, n] = Cs(), r = c(M);
	return v(Os, {
		...e,
		layoutGroup: r,
		switchLayoutGroup: c(Le),
		isPresent: t,
		safeToRemove: n
	});
}
var As = {
	borderRadius: {
		...Es,
		applyTo: [
			"borderTopLeftRadius",
			"borderTopRightRadius",
			"borderBottomLeftRadius",
			"borderBottomRightRadius"
		]
	},
	borderTopLeftRadius: Es,
	borderTopRightRadius: Es,
	borderBottomLeftRadius: Es,
	borderBottomRightRadius: Es,
	boxShadow: Ds
};
// ../build-deps/node_modules/framer-motion/dist/es/animation/animate/single-value.mjs
function js(e, t, n) {
	let r = Xe(e) ? e : Yn(e);
	return r.start(Ha("", r, t, n)), r.animation;
}
// ../build-deps/node_modules/framer-motion/dist/es/render/dom/utils/is-svg-element.mjs
function Ms(e) {
	return e instanceof SVGElement && e.tagName !== "svg";
}
// ../build-deps/node_modules/framer-motion/dist/es/render/utils/compare-by-depth.mjs
var Ns = (e, t) => e.depth - t.depth, Ps = class {
	constructor() {
		this.children = [], this.isDirty = !1;
	}
	add(e) {
		Vn(this.children, e), this.isDirty = !0;
	}
	remove(e) {
		Hn(this.children, e), this.isDirty = !0;
	}
	forEach(e) {
		this.isDirty && this.children.sort(Ns), this.isDirty = !1, this.children.forEach(e);
	}
};
// ../build-deps/node_modules/framer-motion/dist/es/utils/delay.mjs
function Fs(e, t) {
	let n = Bn.now(), r = ({ timestamp: i }) => {
		let a = i - n;
		a >= t && (V(r), e(a - t));
	};
	return B.read(r, !0), () => V(r);
}
// ../build-deps/node_modules/framer-motion/dist/es/projection/animation/mix-values.mjs
var Is = [
	"TopLeft",
	"TopRight",
	"BottomLeft",
	"BottomRight"
], Ls = Is.length, Rs = (e) => typeof e == "string" ? parseFloat(e) : e, zs = (e) => typeof e == "number" || J.test(e);
function Bs(e, t, n, r, i, a) {
	i ? (e.opacity = Y(0, n.opacity === void 0 ? 1 : n.opacity, Hs(r)), e.opacityExit = Y(t.opacity === void 0 ? 1 : t.opacity, 0, Us(r))) : a && (e.opacity = Y(t.opacity === void 0 ? 1 : t.opacity, n.opacity === void 0 ? 1 : n.opacity, r));
	for (let i = 0; i < Ls; i++) {
		let a = `border${Is[i]}Radius`, o = Vs(t, a), s = Vs(n, a);
		(o !== void 0 || s !== void 0) && (o ||= 0, s ||= 0, o === 0 || s === 0 || zs(o) === zs(s) ? (e[a] = Math.max(Y(Rs(o), Rs(s), r), 0), (St.test(s) || St.test(o)) && (e[a] += "%")) : e[a] = s);
	}
	(t.rotate || n.rotate) && (e.rotate = Y(t.rotate || 0, n.rotate || 0, r));
}
function Vs(e, t) {
	return e[t] === void 0 ? e.borderRadius : e[t];
}
var Hs = /*@__PURE__*/ Ws(0, .5, mr), Us = /*@__PURE__*/ Ws(.5, .95, N);
function Ws(e, t, n) {
	return (r) => r < e ? 0 : r > t ? 1 : n(/* @__PURE__ */ F(e, t, r));
}
// ../build-deps/node_modules/framer-motion/dist/es/projection/geometry/copy.mjs
function Gs(e, t) {
	e.min = t.min, e.max = t.max;
}
function Ks(e, t) {
	Gs(e.x, t.x), Gs(e.y, t.y);
}
function qs(e, t) {
	e.translate = t.translate, e.scale = t.scale, e.originPoint = t.originPoint, e.origin = t.origin;
}
// ../build-deps/node_modules/framer-motion/dist/es/projection/geometry/delta-remove.mjs
function Js(e, t, n, r, i) {
	return e -= t, e = rs(e, 1 / n, r), i !== void 0 && (e = rs(e, 1 / i, r)), e;
}
function Ys(e, t = 0, n = 1, r = .5, i, a = e, o = e) {
	if (St.test(t) && (t = parseFloat(t), t = Y(o.min, o.max, t / 100) - o.min), typeof t != "number") return;
	let s = Y(a.min, a.max, r);
	e === a && (s -= t), e.min = Js(e.min, t, n, s, i), e.max = Js(e.max, t, n, s, i);
}
function Xs(e, t, [n, r, i], a, o) {
	Ys(e, t[n], t[r], t[i], t.scale, a, o);
}
var Zs = [
	"x",
	"scaleX",
	"originX"
], Qs = [
	"y",
	"scaleY",
	"originY"
];
function $s(e, t, n, r) {
	Xs(e.x, t, Zs, n ? n.x : void 0, r ? r.x : void 0), Xs(e.y, t, Qs, n ? n.y : void 0, r ? r.y : void 0);
}
// ../build-deps/node_modules/framer-motion/dist/es/projection/geometry/utils.mjs
function ec(e) {
	return e.translate === 0 && e.scale === 1;
}
function tc(e) {
	return ec(e.x) && ec(e.y);
}
function nc(e, t) {
	return e.min === t.min && e.max === t.max;
}
function rc(e, t) {
	return nc(e.x, t.x) && nc(e.y, t.y);
}
function ic(e, t) {
	return Math.round(e.min) === Math.round(t.min) && Math.round(e.max) === Math.round(t.max);
}
function ac(e, t) {
	return ic(e.x, t.x) && ic(e.y, t.y);
}
function oc(e) {
	return Eo(e.x) / Eo(e.y);
}
function sc(e, t) {
	return e.translate === t.translate && e.scale === t.scale && e.originPoint === t.originPoint;
}
// ../build-deps/node_modules/framer-motion/dist/es/projection/shared/stack.mjs
var cc = class {
	constructor() {
		this.members = [];
	}
	add(e) {
		Vn(this.members, e), e.scheduleRender();
	}
	remove(e) {
		if (Hn(this.members, e), e === this.prevLead && (this.prevLead = void 0), e === this.lead) {
			let e = this.members[this.members.length - 1];
			e && this.promote(e);
		}
	}
	relegate(e) {
		let t = this.members.findIndex((t) => e === t);
		if (t === 0) return !1;
		let n;
		for (let e = t; e >= 0; e--) {
			let t = this.members[e];
			if (t.isPresent !== !1) {
				n = t;
				break;
			}
		}
		return n ? (this.promote(n), !0) : !1;
	}
	promote(e, t) {
		let n = this.lead;
		if (e !== n && (this.prevLead = n, this.lead = e, e.show(), n)) {
			n.instance && n.scheduleRender(), e.scheduleRender(), e.resumeFrom = n, t && (e.resumeFrom.preserveOpacity = !0), n.snapshot && (e.snapshot = n.snapshot, e.snapshot.latestValues = n.animationValues || n.latestValues), e.root && e.root.isUpdating && (e.isLayoutDirty = !0);
			let { crossfade: r } = e.options;
			r === !1 && n.hide();
		}
	}
	exitAnimationComplete() {
		this.members.forEach((e) => {
			let { options: t, resumingFrom: n } = e;
			t.onExitComplete && t.onExitComplete(), n && n.options.onExitComplete && n.options.onExitComplete();
		});
	}
	scheduleRender() {
		this.members.forEach((e) => {
			e.instance && e.scheduleRender(!1);
		});
	}
	removeLeadSnapshot() {
		this.lead && this.lead.snapshot && (this.lead.snapshot = void 0);
	}
};
// ../build-deps/node_modules/framer-motion/dist/es/projection/styles/transform.mjs
function lc(e, t, n) {
	let r = "", i = e.x.translate / t.x, a = e.y.translate / t.y, o = n?.z || 0;
	if ((i || a || o) && (r = `translate3d(${i}px, ${a}px, ${o}px) `), (t.x !== 1 || t.y !== 1) && (r += `scale(${1 / t.x}, ${1 / t.y}) `), n) {
		let { transformPerspective: e, rotate: t, rotateX: i, rotateY: a, skewX: o, skewY: s } = n;
		e && (r = `perspective(${e}px) ${r}`), t && (r += `rotate(${t}deg) `), i && (r += `rotateX(${i}deg) `), a && (r += `rotateY(${a}deg) `), o && (r += `skewX(${o}deg) `), s && (r += `skewY(${s}deg) `);
	}
	let s = e.x.scale * t.x, c = e.y.scale * t.y;
	return (s !== 1 || c !== 1) && (r += `scale(${s}, ${c})`), r || "none";
}
// ../build-deps/node_modules/framer-motion/dist/es/projection/node/create-projection-node.mjs
var uc = {
	type: "projectionFrame",
	totalNodes: 0,
	resolvedTargetDeltas: 0,
	recalculatedProjection: 0
}, dc = typeof window < "u" && window.MotionDebug !== void 0, fc = [
	"",
	"X",
	"Y",
	"Z"
], pc = { visibility: "hidden" }, mc = 1e3, hc = 0;
function gc(e, t, n, r) {
	let { latestValues: i } = t;
	i[e] && (n[e] = i[e], t.setStaticValue(e, 0), r && (r[e] = 0));
}
function _c(e) {
	if (e.hasCheckedOptimisedAppear = !0, e.root === e) return;
	let { visualElement: t } = e.options;
	if (!t) return;
	let n = er(t);
	if (window.MotionHasOptimisedAnimation(n, "transform")) {
		let { layout: t, layoutId: r } = e.options;
		window.MotionCancelOptimisedAnimation(n, "transform", B, !(t || r));
	}
	let { parent: r } = e;
	r && !r.hasCheckedOptimisedAppear && _c(r);
}
function vc({ attachResizeListener: e, defaultParent: t, measureScroll: n, checkIsScrollRoot: r, resetTransform: i }) {
	return class {
		constructor(e = {}, n = t?.()) {
			this.id = hc++, this.animationId = 0, this.children = /* @__PURE__ */ new Set(), this.options = {}, this.isTreeAnimating = !1, this.isAnimationBlocked = !1, this.isLayoutDirty = !1, this.isProjectionDirty = !1, this.isSharedProjectionDirty = !1, this.isTransformDirty = !1, this.updateManuallyBlocked = !1, this.updateBlockedByResize = !1, this.isUpdating = !1, this.isSVG = !1, this.needsReset = !1, this.shouldResetTransform = !1, this.hasCheckedOptimisedAppear = !1, this.treeScale = {
				x: 1,
				y: 1
			}, this.eventHandlers = /* @__PURE__ */ new Map(), this.hasTreeAnimated = !1, this.updateScheduled = !1, this.scheduleUpdate = () => this.update(), this.projectionUpdateScheduled = !1, this.checkUpdateFailed = () => {
				this.isUpdating && (this.isUpdating = !1, this.clearAllSnapshots());
			}, this.updateProjection = () => {
				this.projectionUpdateScheduled = !1, dc && (uc.totalNodes = uc.resolvedTargetDeltas = uc.recalculatedProjection = 0), this.nodes.forEach(xc), this.nodes.forEach(Oc), this.nodes.forEach(kc), this.nodes.forEach(Sc), dc && window.MotionDebug.record(uc);
			}, this.resolvedRelativeTargetAt = 0, this.hasProjected = !1, this.isVisible = !0, this.animationProgress = 0, this.sharedNodes = /* @__PURE__ */ new Map(), this.latestValues = e, this.root = n ? n.root || n : this, this.path = n ? [...n.path, n] : [], this.parent = n, this.depth = n ? n.depth + 1 : 0;
			for (let e = 0; e < this.path.length; e++) this.path[e].shouldResetTransform = !0;
			this.root === this && (this.nodes = new Ps());
		}
		addEventListener(e, t) {
			return this.eventHandlers.has(e) || this.eventHandlers.set(e, new Un()), this.eventHandlers.get(e).add(t);
		}
		notifyListeners(e, ...t) {
			let n = this.eventHandlers.get(e);
			n && n.notify(...t);
		}
		hasListeners(e) {
			return this.eventHandlers.has(e);
		}
		mount(t, n = this.root.hasTreeAnimated) {
			if (this.instance) return;
			this.isSVG = Ms(t), this.instance = t;
			let { layoutId: r, layout: i, visualElement: a } = this.options;
			if (a && !a.current && a.mount(t), this.root.nodes.add(this), this.parent && this.parent.children.add(this), n && (i || r) && (this.isLayoutDirty = !0), e) {
				let n, r = () => this.root.updateBlockedByResize = !1;
				e(t, () => {
					this.root.updateBlockedByResize = !0, n && n(), n = Fs(r, 250), ws.hasAnimatedSinceResize && (ws.hasAnimatedSinceResize = !1, this.nodes.forEach(Dc));
				});
			}
			r && this.root.registerSharedNode(r, this), this.options.animate !== !1 && a && (r || i) && this.addEventListener("didUpdate", ({ delta: e, hasLayoutChanged: t, hasRelativeTargetChanged: n, layout: r }) => {
				if (this.isTreeAnimationBlocked()) {
					this.target = void 0, this.relativeTarget = void 0;
					return;
				}
				let i = this.options.transition || a.getDefaultTransition() || Ic, { onLayoutAnimationStart: o, onLayoutAnimationComplete: s } = a.getProps(), c = !this.targetLayout || !ac(this.targetLayout, r) || n, l = !t && n;
				if (this.options.layoutRoot || this.resumeFrom && this.resumeFrom.instance || l || t && (c || !this.currentAnimation)) {
					this.resumeFrom && (this.resumingFrom = this.resumeFrom, this.resumingFrom.resumingFrom = void 0), this.setAnimationOrigin(e, l);
					let t = {
						...sn(i, "layout"),
						onPlay: o,
						onComplete: s
					};
					(a.shouldReduceMotion || this.options.layoutRoot) && (t.delay = 0, t.type = !1), this.startAnimation(t);
				} else t || Dc(this), this.isLead() && this.options.onExitComplete && this.options.onExitComplete();
				this.targetLayout = r;
			});
		}
		unmount() {
			this.options.layoutId && this.willUpdate(), this.root.nodes.remove(this);
			let e = this.getStack();
			e && e.remove(this), this.parent && this.parent.children.delete(this), this.instance = void 0, V(this.updateProjection);
		}
		blockUpdate() {
			this.updateManuallyBlocked = !0;
		}
		unblockUpdate() {
			this.updateManuallyBlocked = !1;
		}
		isUpdateBlocked() {
			return this.updateManuallyBlocked || this.updateBlockedByResize;
		}
		isTreeAnimationBlocked() {
			return this.isAnimationBlocked || this.parent && this.parent.isTreeAnimationBlocked() || !1;
		}
		startUpdate() {
			this.isUpdateBlocked() || (this.isUpdating = !0, this.nodes && this.nodes.forEach(Ac), this.animationId++);
		}
		getTransformTemplate() {
			let { visualElement: e } = this.options;
			return e && e.getProps().transformTemplate;
		}
		willUpdate(e = !0) {
			if (this.root.hasTreeAnimated = !0, this.root.isUpdateBlocked()) {
				this.options.onExitComplete && this.options.onExitComplete();
				return;
			}
			if (window.MotionCancelOptimisedAnimation && !this.hasCheckedOptimisedAppear && _c(this), !this.root.isUpdating && this.root.startUpdate(), this.isLayoutDirty) return;
			this.isLayoutDirty = !0;
			for (let e = 0; e < this.path.length; e++) {
				let t = this.path[e];
				t.shouldResetTransform = !0, t.updateScroll("snapshot"), t.options.layoutRoot && t.willUpdate(!1);
			}
			let { layoutId: t, layout: n } = this.options;
			if (t === void 0 && !n) return;
			let r = this.getTransformTemplate();
			this.prevTransformTemplateValue = r ? r(this.latestValues, "") : void 0, this.updateSnapshot(), e && this.notifyListeners("willUpdate");
		}
		update() {
			if (this.updateScheduled = !1, this.isUpdateBlocked()) {
				this.unblockUpdate(), this.clearAllSnapshots(), this.nodes.forEach(wc);
				return;
			}
			this.isUpdating || this.nodes.forEach(Tc), this.isUpdating = !1, this.nodes.forEach(Ec), this.nodes.forEach(yc), this.nodes.forEach(bc), this.clearAllSnapshots();
			let e = Bn.now();
			H.delta = gt(0, 1e3 / 60, e - H.timestamp), H.timestamp = e, H.isProcessing = !0, le.update.process(H), le.preRender.process(H), le.render.process(H), H.isProcessing = !1;
		}
		didUpdate() {
			this.updateScheduled || (this.updateScheduled = !0, Fe.read(this.scheduleUpdate));
		}
		clearAllSnapshots() {
			this.nodes.forEach(Cc), this.sharedNodes.forEach(jc);
		}
		scheduleUpdateProjection() {
			this.projectionUpdateScheduled || (this.projectionUpdateScheduled = !0, B.preRender(this.updateProjection, !1, !0));
		}
		scheduleCheckAfterUnmount() {
			B.postRender(() => {
				this.isLayoutDirty ? this.root.didUpdate() : this.root.checkUpdateFailed();
			});
		}
		updateSnapshot() {
			!this.snapshot && this.instance && (this.snapshot = this.measure());
		}
		updateLayout() {
			if (!this.instance || (this.updateScroll(), !(this.options.alwaysMeasureLayout && this.isLead()) && !this.isLayoutDirty)) return;
			if (this.resumeFrom && !this.resumeFrom.instance) for (let e = 0; e < this.path.length; e++) this.path[e].updateScroll();
			let e = this.layout;
			this.layout = this.measure(!1), this.layoutCorrected = Z(), this.isLayoutDirty = !1, this.projectionDelta = void 0, this.notifyListeners("measure", this.layout.layoutBox);
			let { visualElement: t } = this.options;
			t && t.notify("LayoutMeasure", this.layout.layoutBox, e ? e.layoutBox : void 0);
		}
		updateScroll(e = "measure") {
			let t = !!(this.options.layoutScroll && this.instance);
			if (this.scroll && this.scroll.animationId === this.root.animationId && this.scroll.phase === e && (t = !1), t) {
				let t = r(this.instance);
				this.scroll = {
					animationId: this.root.animationId,
					phase: e,
					isRoot: t,
					offset: n(this.instance),
					wasRoot: this.scroll ? this.scroll.isRoot : t
				};
			}
		}
		resetTransform() {
			if (!i) return;
			let e = this.isLayoutDirty || this.shouldResetTransform || this.options.alwaysMeasureLayout, t = this.projectionDelta && !tc(this.projectionDelta), n = this.getTransformTemplate(), r = n ? n(this.latestValues, "") : void 0, a = r !== this.prevTransformTemplateValue;
			e && (t || es(this.latestValues) || a) && (i(this.instance, r), this.shouldResetTransform = !1, this.scheduleRender());
		}
		measure(e = !0) {
			let t = this.measurePageBox(), n = this.removeElementScroll(t);
			return e && (n = this.removeTransform(n)), Bc(n), {
				animationId: this.root.animationId,
				measuredBox: t,
				layoutBox: n,
				latestValues: {},
				source: this.id
			};
		}
		measurePageBox() {
			let { visualElement: e } = this.options;
			if (!e) return Z();
			let t = e.measureViewportBox();
			if (!(this.scroll?.wasRoot || this.path.some(Hc))) {
				let { scroll: e } = this.root;
				e && (us(t.x, e.offset.x), us(t.y, e.offset.y));
			}
			return t;
		}
		removeElementScroll(e) {
			let t = Z();
			if (Ks(t, e), this.scroll?.wasRoot) return t;
			for (let n = 0; n < this.path.length; n++) {
				let r = this.path[n], { scroll: i, options: a } = r;
				r !== this.root && i && a.layoutScroll && (i.wasRoot && Ks(t, e), us(t.x, i.offset.x), us(t.y, i.offset.y));
			}
			return t;
		}
		applyTransform(e, t = !1) {
			let n = Z();
			Ks(n, e);
			for (let e = 0; e < this.path.length; e++) {
				let r = this.path[e];
				!t && r.options.layoutScroll && r.scroll && r !== r.root && fs(n, {
					x: -r.scroll.offset.x,
					y: -r.scroll.offset.y
				}), es(r.latestValues) && fs(n, r.latestValues);
			}
			return es(this.latestValues) && fs(n, this.latestValues), n;
		}
		removeTransform(e) {
			let t = Z();
			Ks(t, e);
			for (let e = 0; e < this.path.length; e++) {
				let n = this.path[e];
				if (!n.instance || !es(n.latestValues)) continue;
				$o(n.latestValues) && n.updateSnapshot();
				let r = Z();
				Ks(r, n.measurePageBox()), $s(t, n.latestValues, n.snapshot ? n.snapshot.layoutBox : void 0, r);
			}
			return es(this.latestValues) && $s(t, this.latestValues), t;
		}
		setTargetDelta(e) {
			this.targetDelta = e, this.root.scheduleUpdateProjection(), this.isProjectionDirty = !0;
		}
		setOptions(e) {
			this.options = {
				...this.options,
				...e,
				crossfade: e.crossfade === void 0 || e.crossfade
			};
		}
		clearMeasurements() {
			this.scroll = void 0, this.layout = void 0, this.snapshot = void 0, this.prevTransformTemplateValue = void 0, this.targetDelta = void 0, this.target = void 0, this.isLayoutDirty = !1;
		}
		forceRelativeParentToResolveTarget() {
			this.relativeParent && this.relativeParent.resolvedRelativeTargetAt !== H.timestamp && this.relativeParent.resolveTargetDelta(!0);
		}
		resolveTargetDelta(e = !1) {
			let t = this.getLead();
			this.isProjectionDirty ||= t.isProjectionDirty, this.isTransformDirty ||= t.isTransformDirty, this.isSharedProjectionDirty ||= t.isSharedProjectionDirty;
			let n = !!this.resumingFrom || this !== t;
			if (!(e || n && this.isSharedProjectionDirty || this.isProjectionDirty || this.parent?.isProjectionDirty || this.attemptToResolveRelativeTarget || this.root.updateBlockedByResize)) return;
			let { layout: r, layoutId: i } = this.options;
			if (this.layout && (r || i)) {
				if (this.resolvedRelativeTargetAt = H.timestamp, !this.targetDelta && !this.relativeTarget) {
					let e = this.getClosestProjectingParent();
					e && e.layout && this.animationProgress !== 1 ? (this.relativeParent = e, this.forceRelativeParentToResolveTarget(), this.relativeTarget = Z(), this.relativeTargetOrigin = Z(), No(this.relativeTargetOrigin, this.layout.layoutBox, e.layout.layoutBox), Ks(this.relativeTarget, this.relativeTargetOrigin)) : this.relativeParent = this.relativeTarget = void 0;
				}
				if (this.relativeTarget || this.targetDelta) {
					if (this.target || (this.target = Z(), this.targetWithTransforms = Z()), this.relativeTarget && this.relativeTargetOrigin && this.relativeParent && this.relativeParent.target ? (this.forceRelativeParentToResolveTarget(), jo(this.target, this.relativeTarget, this.relativeParent.target)) : this.targetDelta ? (this.resumingFrom ? this.target = this.applyTransform(this.layout.layoutBox) : Ks(this.target, this.layout.layoutBox), os(this.target, this.targetDelta)) : Ks(this.target, this.layout.layoutBox), this.attemptToResolveRelativeTarget) {
						this.attemptToResolveRelativeTarget = !1;
						let e = this.getClosestProjectingParent();
						e && !!e.resumingFrom == !!this.resumingFrom && !e.options.layoutScroll && e.target && this.animationProgress !== 1 ? (this.relativeParent = e, this.forceRelativeParentToResolveTarget(), this.relativeTarget = Z(), this.relativeTargetOrigin = Z(), No(this.relativeTargetOrigin, this.target, e.target), Ks(this.relativeTarget, this.relativeTargetOrigin)) : this.relativeParent = this.relativeTarget = void 0;
					}
					dc && uc.resolvedTargetDeltas++;
				}
			}
		}
		getClosestProjectingParent() {
			if (!(!this.parent || $o(this.parent.latestValues) || ts(this.parent.latestValues))) return this.parent.isProjecting() ? this.parent : this.parent.getClosestProjectingParent();
		}
		isProjecting() {
			return !!((this.relativeTarget || this.targetDelta || this.options.layoutRoot) && this.layout);
		}
		calcProjection() {
			let e = this.getLead(), t = !!this.resumingFrom || this !== e, n = !0;
			if ((this.isProjectionDirty || this.parent?.isProjectionDirty) && (n = !1), t && (this.isSharedProjectionDirty || this.isTransformDirty) && (n = !1), this.resolvedRelativeTargetAt === H.timestamp && (n = !1), n) return;
			let { layout: r, layoutId: i } = this.options;
			if (this.isTreeAnimating = !!(this.parent && this.parent.isTreeAnimating || this.currentAnimation || this.pendingAnimation), this.isTreeAnimating || (this.targetDelta = this.relativeTarget = void 0), !this.layout || !(r || i)) return;
			Ks(this.layoutCorrected, this.layout.layoutBox);
			let a = this.treeScale.x, o = this.treeScale.y;
			ls(this.layoutCorrected, this.treeScale, this.path, t), e.layout && !e.target && (this.treeScale.x !== 1 || this.treeScale.y !== 1) && (e.target = e.layout.layoutBox, e.targetWithTransforms = Z());
			let { target: s } = e;
			s ? (!this.projectionDelta || !this.prevProjectionDelta ? this.createProjectionDeltas() : (qs(this.prevProjectionDelta.x, this.projectionDelta.x), qs(this.prevProjectionDelta.y, this.projectionDelta.y)), ko(this.projectionDelta, this.layoutCorrected, s, this.latestValues), this.treeScale.x === a && this.treeScale.y === o && sc(this.projectionDelta.x, this.prevProjectionDelta.x) && sc(this.projectionDelta.y, this.prevProjectionDelta.y) || (this.hasProjected = !0, this.scheduleRender(), this.notifyListeners("projectionUpdate", s)), dc && uc.recalculatedProjection++) : this.prevProjectionDelta && (this.createProjectionDeltas(), this.scheduleRender());
		}
		hide() {
			this.isVisible = !1;
		}
		show() {
			this.isVisible = !0;
		}
		scheduleRender(e = !0) {
			var t;
			if ((t = this.options.visualElement) == null || t.scheduleRender(), e) {
				let e = this.getStack();
				e && e.scheduleRender();
			}
			this.resumingFrom && !this.resumingFrom.instance && (this.resumingFrom = void 0);
		}
		createProjectionDeltas() {
			this.prevProjectionDelta = Ko(), this.projectionDelta = Ko(), this.projectionDeltaWithTransform = Ko();
		}
		setAnimationOrigin(e, t = !1) {
			let n = this.snapshot, r = n ? n.latestValues : {}, i = { ...this.latestValues }, a = Ko();
			this.relativeParent && this.relativeParent.options.layoutRoot || (this.relativeTarget = this.relativeTargetOrigin = void 0), this.attemptToResolveRelativeTarget = !t;
			let o = Z(), s = (n ? n.source : void 0) !== (this.layout ? this.layout.source : void 0), c = this.getStack(), l = !c || c.members.length <= 1, u = !(!s || l || this.options.crossfade !== !0 || this.path.some(Fc));
			this.animationProgress = 0;
			let d;
			this.mixTargetDelta = (t) => {
				let n = t / 1e3;
				Mc(a.x, e.x, n), Mc(a.y, e.y, n), this.setTargetDelta(a), this.relativeTarget && this.relativeTargetOrigin && this.layout && this.relativeParent && this.relativeParent.layout && (No(o, this.layout.layoutBox, this.relativeParent.layout.layoutBox), Pc(this.relativeTarget, this.relativeTargetOrigin, o, n), d && rc(this.relativeTarget, d) && (this.isProjectionDirty = !1), d ||= Z(), Ks(d, this.relativeTarget)), s && (this.animationValues = i, Bs(i, r, this.latestValues, n, u, l)), this.root.scheduleUpdateProjection(), this.scheduleRender(), this.animationProgress = n;
			}, this.mixTargetDelta(this.options.layoutRoot ? 1e3 : 0);
		}
		startAnimation(e) {
			this.notifyListeners("animationStart"), this.currentAnimation && this.currentAnimation.stop(), this.resumingFrom && this.resumingFrom.currentAnimation && this.resumingFrom.currentAnimation.stop(), this.pendingAnimation &&= (V(this.pendingAnimation), void 0), this.pendingAnimation = B.update(() => {
				ws.hasAnimatedSinceResize = !0, this.currentAnimation = js(0, mc, {
					...e,
					onUpdate: (t) => {
						this.mixTargetDelta(t), e.onUpdate && e.onUpdate(t);
					},
					onComplete: () => {
						e.onComplete && e.onComplete(), this.completeAnimation();
					}
				}), this.resumingFrom && (this.resumingFrom.currentAnimation = this.currentAnimation), this.pendingAnimation = void 0;
			});
		}
		completeAnimation() {
			this.resumingFrom && (this.resumingFrom.currentAnimation = void 0, this.resumingFrom.preserveOpacity = void 0);
			let e = this.getStack();
			e && e.exitAnimationComplete(), this.resumingFrom = this.currentAnimation = this.animationValues = void 0, this.notifyListeners("animationComplete");
		}
		finishAnimation() {
			this.currentAnimation && (this.mixTargetDelta && this.mixTargetDelta(mc), this.currentAnimation.stop()), this.completeAnimation();
		}
		applyTransformsToTarget() {
			let e = this.getLead(), { targetWithTransforms: t, target: n, layout: r, latestValues: i } = e;
			if (t && n && r) {
				if (this !== e && this.layout && r && Vc(this.options.animationType, this.layout.layoutBox, r.layoutBox)) {
					n = this.target || Z();
					let t = Eo(this.layout.layoutBox.x);
					n.x.min = e.target.x.min, n.x.max = n.x.min + t;
					let r = Eo(this.layout.layoutBox.y);
					n.y.min = e.target.y.min, n.y.max = n.y.min + r;
				}
				Ks(t, n), fs(t, i), ko(this.projectionDeltaWithTransform, this.layoutCorrected, t, i);
			}
		}
		registerSharedNode(e, t) {
			this.sharedNodes.has(e) || this.sharedNodes.set(e, new cc()), this.sharedNodes.get(e).add(t);
			let n = t.options.initialPromotionConfig;
			t.promote({
				transition: n ? n.transition : void 0,
				preserveFollowOpacity: n && n.shouldPreserveFollowOpacity ? n.shouldPreserveFollowOpacity(t) : void 0
			});
		}
		isLead() {
			let e = this.getStack();
			return !e || e.lead === this;
		}
		getLead() {
			let { layoutId: e } = this.options;
			return e && this.getStack()?.lead || this;
		}
		getPrevLead() {
			let { layoutId: e } = this.options;
			return e ? this.getStack()?.prevLead : void 0;
		}
		getStack() {
			let { layoutId: e } = this.options;
			if (e) return this.root.sharedNodes.get(e);
		}
		promote({ needsReset: e, transition: t, preserveFollowOpacity: n } = {}) {
			let r = this.getStack();
			r && r.promote(this, n), e && (this.projectionDelta = void 0, this.needsReset = !0), t && this.setOptions({ transition: t });
		}
		relegate() {
			let e = this.getStack();
			return e ? e.relegate(this) : !1;
		}
		resetSkewAndRotation() {
			let { visualElement: e } = this.options;
			if (!e) return;
			let t = !1, { latestValues: n } = e;
			if ((n.z || n.rotate || n.rotateX || n.rotateY || n.rotateZ || n.skewX || n.skewY) && (t = !0), !t) return;
			let r = {};
			n.z && gc("z", e, r, this.animationValues);
			for (let t = 0; t < fc.length; t++) gc(`rotate${fc[t]}`, e, r, this.animationValues), gc(`skew${fc[t]}`, e, r, this.animationValues);
			e.render();
			for (let t in r) e.setStaticValue(t, r[t]), this.animationValues && (this.animationValues[t] = r[t]);
			e.scheduleRender();
		}
		getProjectionStyles(e) {
			if (!this.instance || this.isSVG) return;
			if (!this.isVisible) return pc;
			let t = { visibility: "" }, n = this.getTransformTemplate();
			if (this.needsReset) return this.needsReset = !1, t.opacity = "", t.pointerEvents = lt(e?.pointerEvents) || "", t.transform = n ? n(this.latestValues, "") : "none", t;
			let r = this.getLead();
			if (!this.projectionDelta || !this.layout || !r.target) {
				let t = {};
				return this.options.layoutId && (t.opacity = this.latestValues.opacity === void 0 ? 1 : this.latestValues.opacity, t.pointerEvents = lt(e?.pointerEvents) || ""), this.hasProjected && !es(this.latestValues) && (t.transform = n ? n({}, "") : "none", this.hasProjected = !1), t;
			}
			let i = r.animationValues || r.latestValues;
			this.applyTransformsToTarget(), t.transform = lc(this.projectionDeltaWithTransform, this.treeScale, i), n && (t.transform = n(i, t.transform));
			let { x: a, y: o } = this.projectionDelta;
			t.transformOrigin = `${a.origin * 100}% ${o.origin * 100}% 0`, t.opacity = r.animationValues ? r === this ? i.opacity ?? this.latestValues.opacity ?? 1 : this.preserveOpacity ? this.latestValues.opacity : i.opacityExit : r === this ? i.opacity === void 0 ? "" : i.opacity : i.opacityExit === void 0 ? 0 : i.opacityExit;
			for (let e in Ze) {
				if (i[e] === void 0) continue;
				let { correct: n, applyTo: a } = Ze[e], o = t.transform === "none" ? i[e] : n(i[e], r);
				if (a) {
					let e = a.length;
					for (let n = 0; n < e; n++) t[a[n]] = o;
				} else t[e] = o;
			}
			return this.options.layoutId && (t.pointerEvents = r === this ? lt(e?.pointerEvents) || "" : "none"), t;
		}
		clearSnapshot() {
			this.resumeFrom = this.snapshot = void 0;
		}
		resetTree() {
			this.root.nodes.forEach((e) => e.currentAnimation?.stop()), this.root.nodes.forEach(wc), this.root.sharedNodes.clear();
		}
	};
}
function yc(e) {
	e.updateLayout();
}
function bc(e) {
	let t = e.resumeFrom?.snapshot || e.snapshot;
	if (e.isLead() && e.layout && t && e.hasListeners("didUpdate")) {
		let { layoutBox: n, measuredBox: r } = e.layout, { animationType: i } = e.options, a = t.source !== e.layout.source;
		i === "size" ? Jo((e) => {
			let r = a ? t.measuredBox[e] : t.layoutBox[e], i = Eo(r);
			r.min = n[e].min, r.max = r.min + i;
		}) : Vc(i, t.layoutBox, n) && Jo((r) => {
			let i = a ? t.measuredBox[r] : t.layoutBox[r], o = Eo(n[r]);
			i.max = i.min + o, e.relativeTarget && !e.currentAnimation && (e.isProjectionDirty = !0, e.relativeTarget[r].max = e.relativeTarget[r].min + o);
		});
		let o = Ko();
		ko(o, n, t.layoutBox);
		let s = Ko();
		a ? ko(s, e.applyTransform(r, !0), t.measuredBox) : ko(s, n, t.layoutBox);
		let c = !tc(o), l = !1;
		if (!e.resumeFrom) {
			let r = e.getClosestProjectingParent();
			if (r && !r.resumeFrom) {
				let { snapshot: i, layout: a } = r;
				if (i && a) {
					let o = Z();
					No(o, t.layoutBox, i.layoutBox);
					let s = Z();
					No(s, n, a.layoutBox), ac(o, s) || (l = !0), r.options.layoutRoot && (e.relativeTarget = s, e.relativeTargetOrigin = o, e.relativeParent = r);
				}
			}
		}
		e.notifyListeners("didUpdate", {
			layout: n,
			snapshot: t,
			delta: s,
			layoutDelta: o,
			hasLayoutChanged: c,
			hasRelativeTargetChanged: l
		});
	} else if (e.isLead()) {
		let { onExitComplete: t } = e.options;
		t && t();
	}
	e.options.transition = void 0;
}
function xc(e) {
	dc && uc.totalNodes++, e.parent && (e.isProjecting() || (e.isProjectionDirty = e.parent.isProjectionDirty), e.isSharedProjectionDirty ||= !!(e.isProjectionDirty || e.parent.isProjectionDirty || e.parent.isSharedProjectionDirty), e.isTransformDirty ||= e.parent.isTransformDirty);
}
function Sc(e) {
	e.isProjectionDirty = e.isSharedProjectionDirty = e.isTransformDirty = !1;
}
function Cc(e) {
	e.clearSnapshot();
}
function wc(e) {
	e.clearMeasurements();
}
function Tc(e) {
	e.isLayoutDirty = !1;
}
function Ec(e) {
	let { visualElement: t } = e.options;
	t && t.getProps().onBeforeLayoutMeasure && t.notify("BeforeLayoutMeasure"), e.resetTransform();
}
function Dc(e) {
	e.finishAnimation(), e.targetDelta = e.relativeTarget = e.target = void 0, e.isProjectionDirty = !0;
}
function Oc(e) {
	e.resolveTargetDelta();
}
function kc(e) {
	e.calcProjection();
}
function Ac(e) {
	e.resetSkewAndRotation();
}
function jc(e) {
	e.removeLeadSnapshot();
}
function Mc(e, t, n) {
	e.translate = Y(t.translate, 0, n), e.scale = Y(t.scale, 1, n), e.origin = t.origin, e.originPoint = t.originPoint;
}
function Nc(e, t, n, r) {
	e.min = Y(t.min, n.min, r), e.max = Y(t.max, n.max, r);
}
function Pc(e, t, n, r) {
	Nc(e.x, t.x, n.x, r), Nc(e.y, t.y, n.y, r);
}
function Fc(e) {
	return e.animationValues && e.animationValues.opacityExit !== void 0;
}
var Ic = {
	duration: .45,
	ease: [
		.4,
		0,
		.1,
		1
	]
}, Lc = (e) => typeof navigator < "u" && navigator.userAgent && navigator.userAgent.toLowerCase().includes(e), Rc = Lc("applewebkit/") && !Lc("chrome/") ? Math.round : N;
function zc(e) {
	e.min = Rc(e.min), e.max = Rc(e.max);
}
function Bc(e) {
	zc(e.x), zc(e.y);
}
function Vc(e, t, n) {
	return e === "position" || e === "preserve-aspect" && !Do(oc(t), oc(n), .2);
}
function Hc(e) {
	return e !== e.root && e.scroll?.wasRoot;
}
// ../build-deps/node_modules/framer-motion/dist/es/projection/node/DocumentProjectionNode.mjs
var Uc = vc({
	attachResizeListener: (e, t) => co(e, "resize", t),
	measureScroll: () => ({
		x: document.documentElement.scrollLeft || document.body.scrollLeft,
		y: document.documentElement.scrollTop || document.body.scrollTop
	}),
	checkIsScrollRoot: () => !0
}), Wc = { current: void 0 }, Gc = vc({
	measureScroll: (e) => ({
		x: e.scrollLeft,
		y: e.scrollTop
	}),
	defaultParent: () => {
		if (!Wc.current) {
			let e = new Uc({});
			e.mount(window), e.setOptions({ layoutScroll: !0 }), Wc.current = e;
		}
		return Wc.current;
	},
	resetTransform: (e, t) => {
		e.style.transform = t === void 0 ? "none" : t;
	},
	checkIsScrollRoot: (e) => window.getComputedStyle(e).position === "fixed"
}), Kc = {
	pan: { Feature: Ss },
	drag: {
		Feature: bs,
		ProjectionNode: Gc,
		MeasureLayout: ks
	}
};
// ../build-deps/node_modules/framer-motion/dist/es/gestures/hover.mjs
function qc(e, t, n) {
	let { props: r } = e;
	e.animationState && r.whileHover && e.animationState.setActive("whileHover", n === "Start");
	let i = r["onHover" + n];
	i && B.postRender(() => i(t, lo(t)));
}
var Jc = class extends io {
	mount() {
		let { current: e } = this.node;
		e && (this.unmount = En(e, (e) => (qc(this.node, e, "Start"), (e) => qc(this.node, e, "End"))));
	}
	unmount() {}
}, Yc = class extends io {
	constructor() {
		super(...arguments), this.isActive = !1;
	}
	onFocus() {
		let e = !1;
		try {
			e = this.node.current.matches(":focus-visible");
		} catch {
			e = !0;
		}
		e && this.node.animationState && (this.node.animationState.setActive("whileFocus", !0), this.isActive = !0);
	}
	onBlur() {
		this.isActive && this.node.animationState && (this.node.animationState.setActive("whileFocus", !1), this.isActive = !1);
	}
	mount() {
		this.unmount = Bi(co(this.node.current, "focus", () => this.onFocus()), co(this.node.current, "blur", () => this.onBlur()));
	}
	unmount() {}
};
// ../build-deps/node_modules/framer-motion/dist/es/gestures/press.mjs
function Xc(e, t, n) {
	let { props: r } = e;
	e.animationState && r.whileTap && e.animationState.setActive("whileTap", n === "Start");
	let i = r["onTap" + (n === "End" ? "" : n)];
	i && B.postRender(() => i(t, lo(t)));
}
var Zc = class extends io {
	mount() {
		let { current: e } = this.node;
		e && (this.unmount = In(e, (e) => (Xc(this.node, e, "Start"), (e, { success: t }) => Xc(this.node, e, t ? "End" : "Cancel")), { useGlobalTarget: this.node.props.globalTapTarget }));
	}
	unmount() {}
}, Qc = /* @__PURE__ */ new WeakMap(), $c = /* @__PURE__ */ new WeakMap(), el = (e) => {
	let t = Qc.get(e.target);
	t && t(e);
}, tl = (e) => {
	e.forEach(el);
};
function nl({ root: e, ...t }) {
	let n = e || document;
	$c.has(n) || $c.set(n, {});
	let r = $c.get(n), i = JSON.stringify(t);
	return r[i] || (r[i] = new IntersectionObserver(tl, {
		root: e,
		...t
	})), r[i];
}
function rl(e, t, n) {
	let r = nl(t);
	return Qc.set(e, n), r.observe(e), () => {
		Qc.delete(e), r.unobserve(e);
	};
}
// ../build-deps/node_modules/framer-motion/dist/es/motion/features/viewport/index.mjs
var il = {
	some: 0,
	all: 1
}, al = class extends io {
	constructor() {
		super(...arguments), this.hasEnteredView = !1, this.isInView = !1;
	}
	startObserver() {
		this.unmount();
		let { viewport: e = {} } = this.node.getProps(), { root: t, margin: n, amount: r = "some", once: i } = e, a = {
			root: t ? t.current : void 0,
			rootMargin: n,
			threshold: typeof r == "number" ? r : il[r]
		};
		return rl(this.node.current, a, (e) => {
			let { isIntersecting: t } = e;
			if (this.isInView === t || (this.isInView = t, i && !t && this.hasEnteredView)) return;
			t && (this.hasEnteredView = !0), this.node.animationState && this.node.animationState.setActive("whileInView", t);
			let { onViewportEnter: n, onViewportLeave: r } = this.node.getProps(), a = t ? n : r;
			a && a(e);
		});
	}
	mount() {
		this.startObserver();
	}
	update() {
		if (typeof IntersectionObserver > "u") return;
		let { props: e, prevProps: t } = this.node;
		[
			"amount",
			"margin",
			"root"
		].some(ol(e, t)) && this.startObserver();
	}
	unmount() {}
};
function ol({ viewport: e = {} }, { viewport: t = {} } = {}) {
	return (n) => e[n] !== t[n];
}
// ../build-deps/node_modules/framer-motion/dist/es/motion/features/gestures.mjs
var sl = {
	inView: { Feature: al },
	tap: { Feature: Zc },
	focus: { Feature: Yc },
	hover: { Feature: Jc }
}, cl = { layout: {
	ProjectionNode: Gc,
	MeasureLayout: ks
} }, ll = { current: null }, ul = { current: !1 };
// ../build-deps/node_modules/framer-motion/dist/es/utils/reduced-motion/index.mjs
function dl() {
	if (ul.current = !0, ie) {
		if (window.matchMedia) {
			let e = window.matchMedia("(prefers-reduced-motion)"), t = () => ll.current = e.matches;
			e.addListener(t), t();
		} else ll.current = !1;
	}
}
// ../build-deps/node_modules/framer-motion/dist/es/render/utils/motion-values.mjs
function fl(e, t, n) {
	for (let r in t) {
		let i = t[r], a = n[r];
		if (Xe(i)) e.addValue(r, i), process.env.NODE_ENV === "development" && ve(i.version === "11.16.4", `Attempting to mix Motion versions ${i.version} with 11.16.4 may not work as expected.`);
		else if (Xe(a)) e.addValue(r, Yn(i, { owner: e }));
		else if (a !== i) {
			if (e.hasValue(r)) {
				let t = e.getValue(r);
				t.liveStyle === !0 ? t.jump(i) : t.hasAnimated || t.set(i);
			} else {
				let t = e.getStaticValue(r);
				e.addValue(r, Yn(t === void 0 ? i : t, { owner: e }));
			}
		}
	}
	for (let r in n) t[r] === void 0 && e.removeValue(r);
	return t;
}
// ../build-deps/node_modules/framer-motion/dist/es/render/store.mjs
var pl = /* @__PURE__ */ new WeakMap(), ml = [
	...Mr,
	$r,
	pi
], hl = (e) => ml.find(jr(e)), gl = [
	"AnimationStart",
	"AnimationComplete",
	"Update",
	"BeforeLayoutMeasure",
	"LayoutMeasure",
	"LayoutAnimationStart",
	"LayoutAnimationComplete"
], _l = class {
	scrapeMotionValuesFromProps(e, t, n) {
		return {};
	}
	constructor({ parent: e, props: t, presenceContext: n, reducedMotionConfig: r, blockInitialAnimation: i, visualState: a }, o = {}) {
		this.current = null, this.children = /* @__PURE__ */ new Set(), this.isVariantNode = !1, this.isControllingVariants = !1, this.shouldReduceMotion = null, this.values = /* @__PURE__ */ new Map(), this.KeyframeResolver = Br, this.features = {}, this.valueSubscriptions = /* @__PURE__ */ new Map(), this.prevMotionValues = {}, this.events = {}, this.propEventSubscriptions = {}, this.notifyUpdate = () => this.notify("Update", this.latestValues), this.render = () => {
			this.current && (this.triggerBuild(), this.renderInstance(this.current, this.renderState, this.props.style, this.projection));
		}, this.renderScheduledAt = 0, this.scheduleRender = () => {
			let e = Bn.now();
			this.renderScheduledAt < e && (this.renderScheduledAt = e, B.render(this.render, !1, !0));
		};
		let { latestValues: s, renderState: c } = a;
		this.latestValues = s, this.baseTarget = { ...s }, this.initialValues = t.initial ? { ...s } : {}, this.renderState = c, this.parent = e, this.props = t, this.presenceContext = n, this.depth = e ? e.depth + 1 : 0, this.reducedMotionConfig = r, this.options = o, this.blockInitialAnimation = !!i, this.isControllingVariants = Te(t), this.isVariantNode = Ee(t), this.isVariantNode && (this.variantChildren = /* @__PURE__ */ new Set()), this.manuallyAnimateOnMount = !!(e && e.current);
		let { willChange: l, ...u } = this.scrapeMotionValuesFromProps(t, {}, this);
		for (let e in u) {
			let t = u[e];
			s[e] !== void 0 && Xe(t) && t.set(s[e], !1);
		}
	}
	mount(e) {
		this.current = e, pl.set(e, this), this.projection && !this.projection.instance && this.projection.mount(e), this.parent && this.isVariantNode && !this.isControllingVariants && (this.removeFromVariantTree = this.parent.addVariantChild(this)), this.values.forEach((e, t) => this.bindToMotionValue(t, e)), ul.current || dl(), this.shouldReduceMotion = this.reducedMotionConfig === "never" ? !1 : this.reducedMotionConfig === "always" || ll.current, process.env.NODE_ENV !== "production" && ve(this.shouldReduceMotion !== !0, "You have Reduced Motion enabled on your device. Animations may not appear as expected."), this.parent && this.parent.children.add(this), this.update(this.props, this.presenceContext);
	}
	unmount() {
		pl.delete(this.current), this.projection && this.projection.unmount(), V(this.notifyUpdate), V(this.render), this.valueSubscriptions.forEach((e) => e()), this.valueSubscriptions.clear(), this.removeFromVariantTree && this.removeFromVariantTree(), this.parent && this.parent.children.delete(this);
		for (let e in this.events) this.events[e].clear();
		for (let e in this.features) {
			let t = this.features[e];
			t && (t.unmount(), t.isMounted = !1);
		}
		this.current = null;
	}
	bindToMotionValue(e, t) {
		this.valueSubscriptions.has(e) && this.valueSubscriptions.get(e)();
		let n = et.has(e), r = t.on("change", (t) => {
			this.latestValues[e] = t, this.props.onUpdate && B.preRender(this.notifyUpdate), n && this.projection && (this.projection.isTransformDirty = !0);
		}), i = t.on("renderRequest", this.scheduleRender), a;
		window.MotionCheckAppearSync && (a = window.MotionCheckAppearSync(this, e, t)), this.valueSubscriptions.set(e, () => {
			r(), i(), a && a(), t.owner && t.stop();
		});
	}
	sortNodePosition(e) {
		return !this.current || !this.sortInstanceNodePosition || this.type !== e.type ? 0 : this.sortInstanceNodePosition(this.current, e.current);
	}
	updateFeatures() {
		let e = "animation";
		for (e in fe) {
			let t = fe[e];
			if (!t) continue;
			let { isEnabled: n, Feature: r } = t;
			if (!this.features[e] && r && n(this.props) && (this.features[e] = new r(this)), this.features[e]) {
				let t = this.features[e];
				t.isMounted ? t.update() : (t.mount(), t.isMounted = !0);
			}
		}
	}
	triggerBuild() {
		this.build(this.renderState, this.latestValues, this.props);
	}
	measureViewportBox() {
		return this.current ? this.measureInstanceViewportBox(this.current, this.props) : Z();
	}
	getStaticValue(e) {
		return this.latestValues[e];
	}
	setStaticValue(e, t) {
		this.latestValues[e] = t;
	}
	update(e, t) {
		(e.transformTemplate || this.props.transformTemplate) && this.scheduleRender(), this.prevProps = this.props, this.props = e, this.prevPresenceContext = this.presenceContext, this.presenceContext = t;
		for (let t = 0; t < gl.length; t++) {
			let n = gl[t];
			this.propEventSubscriptions[n] && (this.propEventSubscriptions[n](), delete this.propEventSubscriptions[n]);
			let r = e["on" + n];
			r && (this.propEventSubscriptions[n] = this.on(n, r));
		}
		this.prevMotionValues = fl(this, this.scrapeMotionValuesFromProps(e, this.prevProps, this), this.prevMotionValues), this.handleChildMotionValue && this.handleChildMotionValue();
	}
	getProps() {
		return this.props;
	}
	getVariant(e) {
		return this.props.variants ? this.props.variants[e] : void 0;
	}
	getDefaultTransition() {
		return this.props.transition;
	}
	getTransformPagePoint() {
		return this.props.transformPagePoint;
	}
	getClosestVariantNode() {
		return this.isVariantNode ? this : this.parent ? this.parent.getClosestVariantNode() : void 0;
	}
	addVariantChild(e) {
		let t = this.getClosestVariantNode();
		if (t) return t.variantChildren && t.variantChildren.add(e), () => t.variantChildren.delete(e);
	}
	addValue(e, t) {
		let n = this.values.get(e);
		t !== n && (n && this.removeValue(e), this.bindToMotionValue(e, t), this.values.set(e, t), this.latestValues[e] = t.get());
	}
	removeValue(e) {
		this.values.delete(e);
		let t = this.valueSubscriptions.get(e);
		t && (t(), this.valueSubscriptions.delete(e)), delete this.latestValues[e], this.removeValueFromRenderState(e, this.renderState);
	}
	hasValue(e) {
		return this.values.has(e);
	}
	getValue(e, t) {
		if (this.props.values && this.props.values[e]) return this.props.values[e];
		let n = this.values.get(e);
		return n === void 0 && t !== void 0 && (n = Yn(t === null ? void 0 : t, { owner: this }), this.addValue(e, n)), n;
	}
	readValue(e, t) {
		let n = this.latestValues[e] !== void 0 || !this.current ? this.latestValues[e] : this.getBaseTargetFromProps(this.props, e) ?? this.readValueFromInstance(this.current, e, this.options);
		return n != null && (typeof n == "string" && (vr(n) || gr(n)) ? n = parseFloat(n) : !hl(n) && pi.test(t) && (n = bi(e, t)), this.setBaseTarget(e, Xe(n) ? n.get() : n)), Xe(n) ? n.get() : n;
	}
	setBaseTarget(e, t) {
		this.baseTarget[e] = t;
	}
	getBaseTarget(e) {
		let { initial: t } = this.props, n;
		if (typeof t == "string" || typeof t == "object") {
			let r = at(this.props, t, this.presenceContext?.custom);
			r && (n = r[e]);
		}
		if (t && n !== void 0) return n;
		let r = this.getBaseTargetFromProps(this.props, e);
		return r !== void 0 && !Xe(r) ? r : this.initialValues[e] !== void 0 && n === void 0 ? void 0 : this.baseTarget[e];
	}
	on(e, t) {
		return this.events[e] || (this.events[e] = new Un()), this.events[e].add(t);
	}
	notify(e, ...t) {
		this.events[e] && this.events[e].notify(...t);
	}
}, vl = class extends _l {
	constructor() {
		super(...arguments), this.KeyframeResolver = Ci;
	}
	sortInstanceNodePosition(e, t) {
		return e.compareDocumentPosition(t) & 2 ? 1 : -1;
	}
	getBaseTargetFromProps(e, t) {
		return e.style ? e.style[t] : void 0;
	}
	removeValueFromRenderState(e, { vars: t, style: n }) {
		delete t[e], delete n[e];
	}
	handleChildMotionValue() {
		this.childSubscription && (this.childSubscription(), delete this.childSubscription);
		let { children: e } = this.props;
		Xe(e) && (this.childSubscription = e.on("change", (e) => {
			this.current && (this.current.textContent = `${e}`);
		}));
	}
};
// ../build-deps/node_modules/framer-motion/dist/es/render/html/HTMLVisualElement.mjs
function yl(e) {
	return window.getComputedStyle(e);
}
var bl = class extends vl {
	constructor() {
		super(...arguments), this.type = "html", this.renderInstance = qe;
	}
	readValueFromInstance(e, t) {
		if (et.has(t)) {
			let e = yi(t);
			return e && e.default || 0;
		}
		{
			let n = yl(e), r = (Pt(t) ? n.getPropertyValue(t) : n[t]) || 0;
			return typeof r == "string" ? r.trim() : r;
		}
	}
	measureInstanceViewportBox(e, { transformPagePoint: t }) {
		return ps(e, t);
	}
	build(e, t, n) {
		Rt(e, t, n.transformTemplate);
	}
	scrapeMotionValuesFromProps(e, t, n) {
		return nt(e, t, n);
	}
}, xl = class extends vl {
	constructor() {
		super(...arguments), this.type = "svg", this.isSVGTag = !1, this.measureInstanceViewportBox = Z;
	}
	getBaseTargetFromProps(e, t) {
		return e[t];
	}
	readValueFromInstance(e, t) {
		if (et.has(t)) {
			let e = yi(t);
			return e && e.default || 0;
		}
		return t = Je.has(t) ? t : Ne(t), e.getAttribute(t);
	}
	scrapeMotionValuesFromProps(e, t, n) {
		return rt(e, t, n);
	}
	build(e, t, n) {
		Wt(e, t, this.isSVGTag, n.transformTemplate);
	}
	renderInstance(e, t, n, r) {
		Ye(e, t, n, r);
	}
	mount(e) {
		this.isSVGTag = Gt(e.tagName), super.mount(e);
	}
}, Sl = (e, t) => Ke(e) ? new xl(t) : new bl(t, { allowProjection: e !== r }), Cl = /*@__PURE__*/ ye(/* @__PURE__ */ en({
	...so,
	...sl,
	...Kc,
	...cl
}, Sl));
// ../build-deps/node_modules/framer-motion/dist/es/value/use-motion-value.mjs
function wl(e) {
	let t = A(() => Yn(e)), { isStatic: n } = c(j);
	if (n) {
		let [, n] = h(e);
		l(() => t.on("change", n), []);
	}
	return t;
}
// ../build-deps/node_modules/framer-motion/dist/es/gestures/drag/use-drag-controls.mjs
var Tl = class {
	constructor() {
		this.componentControls = /* @__PURE__ */ new Set();
	}
	subscribe(e) {
		return this.componentControls.add(e), () => this.componentControls.delete(e);
	}
	start(e, t) {
		this.componentControls.forEach((n) => {
			n.start(e.nativeEvent || e, t);
		});
	}
}, El = () => new Tl();
function Dl() {
	return A(El);
}
// ../build-deps/node_modules/lucide-react/dist/esm/shared/src/utils.js
var Ol = (e) => e.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase(), kl = (...e) => e.filter((e, t, n) => !!e && e.trim() !== "" && n.indexOf(e) === t).join(" ").trim(), Al = {
	xmlns: "http://www.w3.org/2000/svg",
	width: 24,
	height: 24,
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 2,
	strokeLinecap: "round",
	strokeLinejoin: "round"
}, jl = o(({ color: e = "currentColor", size: t = 24, strokeWidth: n = 2, absoluteStrokeWidth: r, className: i = "", children: o, iconNode: s, ...c }, l) => a("svg", {
	ref: l,
	...Al,
	width: t,
	height: t,
	stroke: e,
	strokeWidth: r ? Number(n) * 24 / Number(t) : n,
	className: kl("lucide", i),
	...c
}, [...s.map(([e, t]) => a(e, t)), ...Array.isArray(o) ? o : [o]])), Q = (e, t) => {
	let n = o(({ className: n, ...r }, i) => a(jl, {
		ref: i,
		iconNode: t,
		className: kl(`lucide-${Ol(e)}`, n),
		...r
	}));
	return n.displayName = `${e}`, n;
}, Ml = Q("Activity", [["path", {
	d: "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",
	key: "169zse"
}]]), Nl = Q("AppWindow", [
	["rect", {
		x: "2",
		y: "4",
		width: "20",
		height: "16",
		rx: "2",
		key: "izxlao"
	}],
	["path", {
		d: "M10 4v4",
		key: "pp8u80"
	}],
	["path", {
		d: "M2 8h20",
		key: "d11cs7"
	}],
	["path", {
		d: "M6 4v4",
		key: "1svtjw"
	}]
]), Pl = Q("Archive", [
	["rect", {
		width: "20",
		height: "5",
		x: "2",
		y: "3",
		rx: "1",
		key: "1wp1u1"
	}],
	["path", {
		d: "M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8",
		key: "1s80jp"
	}],
	["path", {
		d: "M10 12h4",
		key: "a56b0p"
	}]
]), Fl = Q("Atom", [
	["circle", {
		cx: "12",
		cy: "12",
		r: "1",
		key: "41hilf"
	}],
	["path", {
		d: "M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5Z",
		key: "1l2ple"
	}],
	["path", {
		d: "M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5Z",
		key: "1wam0m"
	}]
]), Il = Q("Blocks", [["rect", {
	width: "7",
	height: "7",
	x: "14",
	y: "3",
	rx: "1",
	key: "6d4xhi"
}], ["path", {
	d: "M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H3",
	key: "1fpvtg"
}]]), Ll = Q("BookOpen", [["path", {
	d: "M12 7v14",
	key: "1akyts"
}], ["path", {
	d: "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z",
	key: "ruj8y"
}]]), Rl = Q("Bot", [
	["path", {
		d: "M12 8V4H8",
		key: "hb8ula"
	}],
	["rect", {
		width: "16",
		height: "12",
		x: "4",
		y: "8",
		rx: "2",
		key: "enze0r"
	}],
	["path", {
		d: "M2 14h2",
		key: "vft8re"
	}],
	["path", {
		d: "M20 14h2",
		key: "4cs60a"
	}],
	["path", {
		d: "M15 13v2",
		key: "1xurst"
	}],
	["path", {
		d: "M9 13v2",
		key: "rq6x2g"
	}]
]), zl = Q("Boxes", [
	["path", {
		d: "M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z",
		key: "lc1i9w"
	}],
	["path", {
		d: "m7 16.5-4.74-2.85",
		key: "1o9zyk"
	}],
	["path", {
		d: "m7 16.5 5-3",
		key: "va8pkn"
	}],
	["path", {
		d: "M7 16.5v5.17",
		key: "jnp8gn"
	}],
	["path", {
		d: "M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z",
		key: "8zsnat"
	}],
	["path", {
		d: "m17 16.5-5-3",
		key: "8arw3v"
	}],
	["path", {
		d: "m17 16.5 4.74-2.85",
		key: "8rfmw"
	}],
	["path", {
		d: "M17 16.5v5.17",
		key: "k6z78m"
	}],
	["path", {
		d: "M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z",
		key: "1xygjf"
	}],
	["path", {
		d: "M12 8 7.26 5.15",
		key: "1vbdud"
	}],
	["path", {
		d: "m12 8 4.74-2.85",
		key: "3rx089"
	}],
	["path", {
		d: "M12 13.5V8",
		key: "1io7kd"
	}]
]), Bl = Q("Braces", [["path", {
	d: "M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1",
	key: "ezmyqa"
}], ["path", {
	d: "M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1",
	key: "e1hn23"
}]]), Vl = Q("Brain", [
	["path", {
		d: "M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z",
		key: "l5xja"
	}],
	["path", {
		d: "M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z",
		key: "ep3f8r"
	}],
	["path", {
		d: "M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4",
		key: "1p4c4q"
	}],
	["path", {
		d: "M17.599 6.5a3 3 0 0 0 .399-1.375",
		key: "tmeiqw"
	}],
	["path", {
		d: "M6.003 5.125A3 3 0 0 0 6.401 6.5",
		key: "105sqy"
	}],
	["path", {
		d: "M3.477 10.896a4 4 0 0 1 .585-.396",
		key: "ql3yin"
	}],
	["path", {
		d: "M19.938 10.5a4 4 0 0 1 .585.396",
		key: "1qfode"
	}],
	["path", {
		d: "M6 18a4 4 0 0 1-1.967-.516",
		key: "2e4loj"
	}],
	["path", {
		d: "M19.967 17.484A4 4 0 0 1 18 18",
		key: "159ez6"
	}]
]), Hl = Q("Bug", [
	["path", {
		d: "m8 2 1.88 1.88",
		key: "fmnt4t"
	}],
	["path", {
		d: "M14.12 3.88 16 2",
		key: "qol33r"
	}],
	["path", {
		d: "M9 7.13v-1a3.003 3.003 0 1 1 6 0v1",
		key: "d7y7pr"
	}],
	["path", {
		d: "M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6",
		key: "xs1cw7"
	}],
	["path", {
		d: "M12 20v-9",
		key: "1qisl0"
	}],
	["path", {
		d: "M6.53 9C4.6 8.8 3 7.1 3 5",
		key: "32zzws"
	}],
	["path", {
		d: "M6 13H2",
		key: "82j7cp"
	}],
	["path", {
		d: "M3 21c0-2.1 1.7-3.9 3.8-4",
		key: "4p0ekp"
	}],
	["path", {
		d: "M20.97 5c0 2.1-1.6 3.8-3.5 4",
		key: "18gb23"
	}],
	["path", {
		d: "M22 13h-4",
		key: "1jl80f"
	}],
	["path", {
		d: "M17.2 17c2.1.1 3.8 1.9 3.8 4",
		key: "k3fwyw"
	}]
]), Ul = Q("Building2", [
	["path", {
		d: "M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z",
		key: "1b4qmf"
	}],
	["path", {
		d: "M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2",
		key: "i71pzd"
	}],
	["path", {
		d: "M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2",
		key: "10jefs"
	}],
	["path", {
		d: "M10 6h4",
		key: "1itunk"
	}],
	["path", {
		d: "M10 10h4",
		key: "tcdvrf"
	}],
	["path", {
		d: "M10 14h4",
		key: "kelpxr"
	}],
	["path", {
		d: "M10 18h4",
		key: "1ulq68"
	}]
]), Wl = Q("Cable", [
	["path", {
		d: "M17 21v-2a1 1 0 0 1-1-1v-1a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1",
		key: "10bnsj"
	}],
	["path", {
		d: "M19 15V6.5a1 1 0 0 0-7 0v11a1 1 0 0 1-7 0V9",
		key: "1eqmu1"
	}],
	["path", {
		d: "M21 21v-2h-4",
		key: "14zm7j"
	}],
	["path", {
		d: "M3 5h4V3",
		key: "z442eg"
	}],
	["path", {
		d: "M7 5a1 1 0 0 1 1 1v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1V3",
		key: "ebdjd7"
	}]
]), Gl = Q("ChartColumn", [
	["path", {
		d: "M3 3v16a2 2 0 0 0 2 2h16",
		key: "c24i48"
	}],
	["path", {
		d: "M18 17V9",
		key: "2bz60n"
	}],
	["path", {
		d: "M13 17V5",
		key: "1frdt8"
	}],
	["path", {
		d: "M8 17v-3",
		key: "17ska0"
	}]
]), Kl = Q("Check", [["path", {
	d: "M20 6 9 17l-5-5",
	key: "1gmf2c"
}]]), ql = Q("ChevronRight", [["path", {
	d: "m9 18 6-6-6-6",
	key: "mthhwq"
}]]), Jl = Q("Circle", [["circle", {
	cx: "12",
	cy: "12",
	r: "10",
	key: "1mglay"
}]]), Yl = Q("CircuitBoard", [
	["rect", {
		width: "18",
		height: "18",
		x: "3",
		y: "3",
		rx: "2",
		key: "afitv7"
	}],
	["path", {
		d: "M11 9h4a2 2 0 0 0 2-2V3",
		key: "1ve2rv"
	}],
	["circle", {
		cx: "9",
		cy: "9",
		r: "2",
		key: "af1f0g"
	}],
	["path", {
		d: "M7 21v-4a2 2 0 0 1 2-2h4",
		key: "1fwkro"
	}],
	["circle", {
		cx: "15",
		cy: "15",
		r: "2",
		key: "3i40o0"
	}]
]), Xl = Q("ClipboardList", [
	["rect", {
		width: "8",
		height: "4",
		x: "8",
		y: "2",
		rx: "1",
		ry: "1",
		key: "tgr4d6"
	}],
	["path", {
		d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
		key: "116196"
	}],
	["path", {
		d: "M12 11h4",
		key: "1jrz19"
	}],
	["path", {
		d: "M12 16h4",
		key: "n85exb"
	}],
	["path", {
		d: "M8 11h.01",
		key: "1dfujw"
	}],
	["path", {
		d: "M8 16h.01",
		key: "18s6g9"
	}]
]), Zl = Q("Coffee", [
	["path", {
		d: "M10 2v2",
		key: "7u0qdc"
	}],
	["path", {
		d: "M14 2v2",
		key: "6buw04"
	}],
	["path", {
		d: "M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1",
		key: "pwadti"
	}],
	["path", {
		d: "M6 2v2",
		key: "colzsn"
	}]
]), Ql = Q("Command", [["path", {
	d: "M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3",
	key: "11bfej"
}]]), $l = Q("Cpu", [
	["rect", {
		width: "16",
		height: "16",
		x: "4",
		y: "4",
		rx: "2",
		key: "14l7u7"
	}],
	["rect", {
		width: "6",
		height: "6",
		x: "9",
		y: "9",
		rx: "1",
		key: "5aljv4"
	}],
	["path", {
		d: "M15 2v2",
		key: "13l42r"
	}],
	["path", {
		d: "M15 20v2",
		key: "15mkzm"
	}],
	["path", {
		d: "M2 15h2",
		key: "1gxd5l"
	}],
	["path", {
		d: "M2 9h2",
		key: "1bbxkp"
	}],
	["path", {
		d: "M20 15h2",
		key: "19e6y8"
	}],
	["path", {
		d: "M20 9h2",
		key: "19tzq7"
	}],
	["path", {
		d: "M9 2v2",
		key: "165o2o"
	}],
	["path", {
		d: "M9 20v2",
		key: "i2bqo8"
	}]
]), eu = Q("Crosshair", [
	["circle", {
		cx: "12",
		cy: "12",
		r: "10",
		key: "1mglay"
	}],
	["line", {
		x1: "22",
		x2: "18",
		y1: "12",
		y2: "12",
		key: "l9bcsi"
	}],
	["line", {
		x1: "6",
		x2: "2",
		y1: "12",
		y2: "12",
		key: "13hhkx"
	}],
	["line", {
		x1: "12",
		x2: "12",
		y1: "6",
		y2: "2",
		key: "10w3f3"
	}],
	["line", {
		x1: "12",
		x2: "12",
		y1: "22",
		y2: "18",
		key: "15g9kq"
	}]
]), tu = Q("Database", [
	["ellipse", {
		cx: "12",
		cy: "5",
		rx: "9",
		ry: "3",
		key: "msslwz"
	}],
	["path", {
		d: "M3 5V19A9 3 0 0 0 21 19V5",
		key: "1wlel7"
	}],
	["path", {
		d: "M3 12A9 3 0 0 0 21 12",
		key: "mv7ke4"
	}]
]), nu = Q("Disc", [["circle", {
	cx: "12",
	cy: "12",
	r: "10",
	key: "1mglay"
}], ["circle", {
	cx: "12",
	cy: "12",
	r: "2",
	key: "1c9p78"
}]]), ru = Q("Download", [
	["path", {
		d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
		key: "ih7n3h"
	}],
	["polyline", {
		points: "7 10 12 15 17 10",
		key: "2ggqvy"
	}],
	["line", {
		x1: "12",
		x2: "12",
		y1: "15",
		y2: "3",
		key: "1vk2je"
	}]
]), iu = Q("Factory", [
	["path", {
		d: "M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z",
		key: "159hny"
	}],
	["path", {
		d: "M17 18h1",
		key: "uldtlt"
	}],
	["path", {
		d: "M12 18h1",
		key: "s9uhes"
	}],
	["path", {
		d: "M7 18h1",
		key: "1neino"
	}]
]), au = Q("FileSearch", [
	["path", {
		d: "M14 2v4a2 2 0 0 0 2 2h4",
		key: "tnqrlb"
	}],
	["path", {
		d: "M4.268 21a2 2 0 0 0 1.727 1H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3",
		key: "ms7g94"
	}],
	["path", {
		d: "m9 18-1.5-1.5",
		key: "1j6qii"
	}],
	["circle", {
		cx: "5",
		cy: "14",
		r: "3",
		key: "ufru5t"
	}]
]), ou = Q("Fingerprint", [
	["path", {
		d: "M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4",
		key: "1nerag"
	}],
	["path", {
		d: "M14 13.12c0 2.38 0 6.38-1 8.88",
		key: "o46ks0"
	}],
	["path", {
		d: "M17.29 21.02c.12-.6.43-2.3.5-3.02",
		key: "ptglia"
	}],
	["path", {
		d: "M2 12a10 10 0 0 1 18-6",
		key: "ydlgp0"
	}],
	["path", {
		d: "M2 16h.01",
		key: "1gqxmh"
	}],
	["path", {
		d: "M21.8 16c.2-2 .131-5.354 0-6",
		key: "drycrb"
	}],
	["path", {
		d: "M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2",
		key: "1tidbn"
	}],
	["path", {
		d: "M8.65 22c.21-.66.45-1.32.57-2",
		key: "13wd9y"
	}],
	["path", {
		d: "M9 6.8a6 6 0 0 1 9 5.2v2",
		key: "1fr1j5"
	}]
]), su = Q("Flame", [["path", {
	d: "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z",
	key: "96xj49"
}]]), cu = Q("FolderOpen", [["path", {
	d: "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2",
	key: "usdka0"
}]]), lu = Q("FolderPlus", [
	["path", {
		d: "M12 10v6",
		key: "1bos4e"
	}],
	["path", {
		d: "M9 13h6",
		key: "1uhe8q"
	}],
	["path", {
		d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
		key: "1kt360"
	}]
]), uu = Q("Gauge", [["path", {
	d: "m12 14 4-4",
	key: "9kzdfg"
}], ["path", {
	d: "M3.34 19a10 10 0 1 1 17.32 0",
	key: "19p75a"
}]]), du = Q("Ghost", [
	["path", {
		d: "M9 10h.01",
		key: "qbtxuw"
	}],
	["path", {
		d: "M15 10h.01",
		key: "1qmjsl"
	}],
	["path", {
		d: "M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z",
		key: "uwwb07"
	}]
]), fu = Q("GitBranch", [
	["line", {
		x1: "6",
		x2: "6",
		y1: "3",
		y2: "15",
		key: "17qcm7"
	}],
	["circle", {
		cx: "18",
		cy: "6",
		r: "3",
		key: "1h7g24"
	}],
	["circle", {
		cx: "6",
		cy: "18",
		r: "3",
		key: "fqmcym"
	}],
	["path", {
		d: "M18 9a9 9 0 0 1-9 9",
		key: "n2h4wq"
	}]
]), pu = Q("GitFork", [
	["circle", {
		cx: "12",
		cy: "18",
		r: "3",
		key: "1mpf1b"
	}],
	["circle", {
		cx: "6",
		cy: "6",
		r: "3",
		key: "1lh9wr"
	}],
	["circle", {
		cx: "18",
		cy: "6",
		r: "3",
		key: "1h7g24"
	}],
	["path", {
		d: "M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9",
		key: "1uq4wg"
	}],
	["path", {
		d: "M12 12v3",
		key: "158kv8"
	}]
]), mu = Q("GitMerge", [
	["circle", {
		cx: "18",
		cy: "18",
		r: "3",
		key: "1xkwt0"
	}],
	["circle", {
		cx: "6",
		cy: "6",
		r: "3",
		key: "1lh9wr"
	}],
	["path", {
		d: "M6 21V9a9 9 0 0 0 9 9",
		key: "7kw0sc"
	}]
]), hu = Q("Globe", [
	["circle", {
		cx: "12",
		cy: "12",
		r: "10",
		key: "1mglay"
	}],
	["path", {
		d: "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20",
		key: "13o1zl"
	}],
	["path", {
		d: "M2 12h20",
		key: "9i4pu4"
	}]
]), gu = Q("GripVertical", [
	["circle", {
		cx: "9",
		cy: "12",
		r: "1",
		key: "1vctgf"
	}],
	["circle", {
		cx: "9",
		cy: "5",
		r: "1",
		key: "hp0tcf"
	}],
	["circle", {
		cx: "9",
		cy: "19",
		r: "1",
		key: "fkjjf6"
	}],
	["circle", {
		cx: "15",
		cy: "12",
		r: "1",
		key: "1tmaij"
	}],
	["circle", {
		cx: "15",
		cy: "5",
		r: "1",
		key: "19l28e"
	}],
	["circle", {
		cx: "15",
		cy: "19",
		r: "1",
		key: "f4zoj3"
	}]
]), _u = Q("Handshake", [
	["path", {
		d: "m11 17 2 2a1 1 0 1 0 3-3",
		key: "efffak"
	}],
	["path", {
		d: "m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4",
		key: "9pr0kb"
	}],
	["path", {
		d: "m21 3 1 11h-2",
		key: "1tisrp"
	}],
	["path", {
		d: "M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3",
		key: "1uvwmv"
	}],
	["path", {
		d: "M3 4h8",
		key: "1ep09j"
	}]
]), vu = Q("HardDrive", [
	["line", {
		x1: "22",
		x2: "2",
		y1: "12",
		y2: "12",
		key: "1y58io"
	}],
	["path", {
		d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
		key: "oot6mr"
	}],
	["line", {
		x1: "6",
		x2: "6.01",
		y1: "16",
		y2: "16",
		key: "sgf278"
	}],
	["line", {
		x1: "10",
		x2: "10.01",
		y1: "16",
		y2: "16",
		key: "1l4acy"
	}]
]), yu = Q("HeartPulse", [["path", {
	d: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z",
	key: "c3ymky"
}], ["path", {
	d: "M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27",
	key: "1uw2ng"
}]]), bu = Q("House", [["path", {
	d: "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",
	key: "5wwlr5"
}], ["path", {
	d: "M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
	key: "1d0kgt"
}]]), xu = Q("Inbox", [["polyline", {
	points: "22 12 16 12 14 15 10 15 8 12 2 12",
	key: "o97t9d"
}], ["path", {
	d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
	key: "oot6mr"
}]]), Su = Q("Kanban", [
	["path", {
		d: "M6 5v11",
		key: "mdvv1e"
	}],
	["path", {
		d: "M12 5v6",
		key: "14ar3b"
	}],
	["path", {
		d: "M18 5v14",
		key: "7ji314"
	}]
]), Cu = Q("Layers", [
	["path", {
		d: "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z",
		key: "zw3jo"
	}],
	["path", {
		d: "M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12",
		key: "1wduqc"
	}],
	["path", {
		d: "M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17",
		key: "kqbvx6"
	}]
]), wu = Q("LayoutGrid", [
	["rect", {
		width: "7",
		height: "7",
		x: "3",
		y: "3",
		rx: "1",
		key: "1g98yp"
	}],
	["rect", {
		width: "7",
		height: "7",
		x: "14",
		y: "3",
		rx: "1",
		key: "6d4xhi"
	}],
	["rect", {
		width: "7",
		height: "7",
		x: "14",
		y: "14",
		rx: "1",
		key: "nxv5o0"
	}],
	["rect", {
		width: "7",
		height: "7",
		x: "3",
		y: "14",
		rx: "1",
		key: "1bb6yr"
	}]
]), Tu = Q("Library", [
	["path", {
		d: "m16 6 4 14",
		key: "ji33uf"
	}],
	["path", {
		d: "M12 6v14",
		key: "1n7gus"
	}],
	["path", {
		d: "M8 8v12",
		key: "1gg7y9"
	}],
	["path", {
		d: "M4 4v16",
		key: "6qkkli"
	}]
]), Eu = Q("ListChecks", [
	["path", {
		d: "m3 17 2 2 4-4",
		key: "1jhpwq"
	}],
	["path", {
		d: "m3 7 2 2 4-4",
		key: "1obspn"
	}],
	["path", {
		d: "M13 6h8",
		key: "15sg57"
	}],
	["path", {
		d: "M13 12h8",
		key: "h98zly"
	}],
	["path", {
		d: "M13 18h8",
		key: "oe0vm4"
	}]
]), Du = Q("Map", [
	["path", {
		d: "M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z",
		key: "169xi5"
	}],
	["path", {
		d: "M15 5.764v15",
		key: "1pn4in"
	}],
	["path", {
		d: "M9 3.236v15",
		key: "1uimfh"
	}]
]), Ou = Q("Maximize2", [
	["polyline", {
		points: "15 3 21 3 21 9",
		key: "mznyad"
	}],
	["polyline", {
		points: "9 21 3 21 3 15",
		key: "1avn1i"
	}],
	["line", {
		x1: "21",
		x2: "14",
		y1: "3",
		y2: "10",
		key: "ota7mn"
	}],
	["line", {
		x1: "3",
		x2: "10",
		y1: "21",
		y2: "14",
		key: "1atl0r"
	}]
]), ku = Q("MessageSquare", [["path", {
	d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
	key: "1lielz"
}]]), Au = Q("Minimize2", [
	["polyline", {
		points: "4 14 10 14 10 20",
		key: "11kfnr"
	}],
	["polyline", {
		points: "20 10 14 10 14 4",
		key: "rlmsce"
	}],
	["line", {
		x1: "14",
		x2: "21",
		y1: "10",
		y2: "3",
		key: "o5lafz"
	}],
	["line", {
		x1: "3",
		x2: "10",
		y1: "21",
		y2: "14",
		key: "1atl0r"
	}]
]), ju = Q("Minus", [["path", {
	d: "M5 12h14",
	key: "1ays0h"
}]]), Mu = Q("Network", [
	["rect", {
		x: "16",
		y: "16",
		width: "6",
		height: "6",
		rx: "1",
		key: "4q2zg0"
	}],
	["rect", {
		x: "2",
		y: "16",
		width: "6",
		height: "6",
		rx: "1",
		key: "8cvhb9"
	}],
	["rect", {
		x: "9",
		y: "2",
		width: "6",
		height: "6",
		rx: "1",
		key: "1egb70"
	}],
	["path", {
		d: "M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3",
		key: "1jsf9p"
	}],
	["path", {
		d: "M12 12V8",
		key: "2874zd"
	}]
]), Nu = Q("Newspaper", [
	["path", {
		d: "M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2",
		key: "7pis2x"
	}],
	["path", {
		d: "M18 14h-8",
		key: "sponae"
	}],
	["path", {
		d: "M15 18h-5",
		key: "95g1m2"
	}],
	["path", {
		d: "M10 6h8v4h-8V6Z",
		key: "smlsk5"
	}]
]), Pu = Q("Package", [
	["path", {
		d: "M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z",
		key: "1a0edw"
	}],
	["path", {
		d: "M12 22V12",
		key: "d0xqtd"
	}],
	["polyline", {
		points: "3.29 7 12 12 20.71 7",
		key: "ousv84"
	}],
	["path", {
		d: "m7.5 4.27 9 5.15",
		key: "1c824w"
	}]
]), Fu = Q("Palette", [
	["circle", {
		cx: "13.5",
		cy: "6.5",
		r: ".5",
		fill: "currentColor",
		key: "1okk4w"
	}],
	["circle", {
		cx: "17.5",
		cy: "10.5",
		r: ".5",
		fill: "currentColor",
		key: "f64h9f"
	}],
	["circle", {
		cx: "8.5",
		cy: "7.5",
		r: ".5",
		fill: "currentColor",
		key: "fotxhn"
	}],
	["circle", {
		cx: "6.5",
		cy: "12.5",
		r: ".5",
		fill: "currentColor",
		key: "qy21gx"
	}],
	["path", {
		d: "M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z",
		key: "12rzf8"
	}]
]), Iu = Q("PanelsTopLeft", [
	["rect", {
		width: "18",
		height: "18",
		x: "3",
		y: "3",
		rx: "2",
		key: "afitv7"
	}],
	["path", {
		d: "M3 9h18",
		key: "1pudct"
	}],
	["path", {
		d: "M9 21V9",
		key: "1oto5p"
	}]
]), Lu = Q("Pin", [["path", {
	d: "M12 17v5",
	key: "bb1du9"
}], ["path", {
	d: "M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z",
	key: "1nkz8b"
}]]), Ru = Q("Plug", [
	["path", {
		d: "M12 22v-5",
		key: "1ega77"
	}],
	["path", {
		d: "M9 8V2",
		key: "14iosj"
	}],
	["path", {
		d: "M15 8V2",
		key: "18g5xt"
	}],
	["path", {
		d: "M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z",
		key: "osxo6l"
	}]
]), zu = Q("Puzzle", [["path", {
	d: "M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z",
	key: "w46dr5"
}]]), Bu = Q("Radar", [
	["path", {
		d: "M19.07 4.93A10 10 0 0 0 6.99 3.34",
		key: "z3du51"
	}],
	["path", {
		d: "M4 6h.01",
		key: "oypzma"
	}],
	["path", {
		d: "M2.29 9.62A10 10 0 1 0 21.31 8.35",
		key: "qzzz0"
	}],
	["path", {
		d: "M16.24 7.76A6 6 0 1 0 8.23 16.67",
		key: "1yjesh"
	}],
	["path", {
		d: "M12 18h.01",
		key: "mhygvu"
	}],
	["path", {
		d: "M17.99 11.66A6 6 0 0 1 15.77 16.67",
		key: "1u2y91"
	}],
	["circle", {
		cx: "12",
		cy: "12",
		r: "2",
		key: "1c9p78"
	}],
	["path", {
		d: "m13.41 10.59 5.66-5.66",
		key: "mhq4k0"
	}]
]), Vu = Q("RadioTower", [
	["path", {
		d: "M4.9 16.1C1 12.2 1 5.8 4.9 1.9",
		key: "s0qx1y"
	}],
	["path", {
		d: "M7.8 4.7a6.14 6.14 0 0 0-.8 7.5",
		key: "1idnkw"
	}],
	["circle", {
		cx: "12",
		cy: "9",
		r: "2",
		key: "1092wv"
	}],
	["path", {
		d: "M16.2 4.8c2 2 2.26 5.11.8 7.47",
		key: "ojru2q"
	}],
	["path", {
		d: "M19.1 1.9a9.96 9.96 0 0 1 0 14.1",
		key: "rhi7fg"
	}],
	["path", {
		d: "M9.5 18h5",
		key: "mfy3pd"
	}],
	["path", {
		d: "m8 22 4-11 4 11",
		key: "25yftu"
	}]
]), Hu = Q("Radio", [
	["path", {
		d: "M4.9 19.1C1 15.2 1 8.8 4.9 4.9",
		key: "1vaf9d"
	}],
	["path", {
		d: "M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5",
		key: "u1ii0m"
	}],
	["circle", {
		cx: "12",
		cy: "12",
		r: "2",
		key: "1c9p78"
	}],
	["path", {
		d: "M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5",
		key: "1j5fej"
	}],
	["path", {
		d: "M19.1 4.9C23 8.8 23 15.1 19.1 19",
		key: "10b0cb"
	}]
]), Uu = Q("Repeat", [
	["path", {
		d: "m17 2 4 4-4 4",
		key: "nntrym"
	}],
	["path", {
		d: "M3 11v-1a4 4 0 0 1 4-4h14",
		key: "84bu3i"
	}],
	["path", {
		d: "m7 22-4-4 4-4",
		key: "1wqhfi"
	}],
	["path", {
		d: "M21 13v1a4 4 0 0 1-4 4H3",
		key: "1rx37r"
	}]
]), Wu = Q("Rocket", [
	["path", {
		d: "M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z",
		key: "m3kijz"
	}],
	["path", {
		d: "m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z",
		key: "1fmvmk"
	}],
	["path", {
		d: "M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0",
		key: "1f8sc4"
	}],
	["path", {
		d: "M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5",
		key: "qeys4"
	}]
]), Gu = Q("Scale", [
	["path", {
		d: "m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z",
		key: "7g6ntu"
	}],
	["path", {
		d: "m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z",
		key: "ijws7r"
	}],
	["path", {
		d: "M7 21h10",
		key: "1b0cd5"
	}],
	["path", {
		d: "M12 3v18",
		key: "108xh3"
	}],
	["path", {
		d: "M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2",
		key: "3gwbw2"
	}]
]), Ku = Q("ScrollText", [
	["path", {
		d: "M15 12h-5",
		key: "r7krc0"
	}],
	["path", {
		d: "M15 8h-5",
		key: "1khuty"
	}],
	["path", {
		d: "M19 17V5a2 2 0 0 0-2-2H4",
		key: "zz82l3"
	}],
	["path", {
		d: "M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3",
		key: "1ph1d7"
	}]
]), qu = Q("Search", [["circle", {
	cx: "11",
	cy: "11",
	r: "8",
	key: "4ej97u"
}], ["path", {
	d: "m21 21-4.3-4.3",
	key: "1qie3q"
}]]), Ju = Q("Server", [
	["rect", {
		width: "20",
		height: "8",
		x: "2",
		y: "2",
		rx: "2",
		ry: "2",
		key: "ngkwjq"
	}],
	["rect", {
		width: "20",
		height: "8",
		x: "2",
		y: "14",
		rx: "2",
		ry: "2",
		key: "iecqi9"
	}],
	["line", {
		x1: "6",
		x2: "6.01",
		y1: "6",
		y2: "6",
		key: "16zg32"
	}],
	["line", {
		x1: "6",
		x2: "6.01",
		y1: "18",
		y2: "18",
		key: "nzw8ys"
	}]
]), Yu = Q("Settings", [["path", {
	d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
	key: "1qme2f"
}], ["circle", {
	cx: "12",
	cy: "12",
	r: "3",
	key: "1v7zrd"
}]]), Xu = Q("Shapes", [
	["path", {
		d: "M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z",
		key: "1bo67w"
	}],
	["rect", {
		x: "3",
		y: "14",
		width: "7",
		height: "7",
		rx: "1",
		key: "1bkyp8"
	}],
	["circle", {
		cx: "17.5",
		cy: "17.5",
		r: "3.5",
		key: "w3z12y"
	}]
]), Zu = Q("ShieldAlert", [
	["path", {
		d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
		key: "oel41y"
	}],
	["path", {
		d: "M12 8v4",
		key: "1got3b"
	}],
	["path", {
		d: "M12 16h.01",
		key: "1drbdi"
	}]
]), Qu = Q("ShieldCheck", [["path", {
	d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
	key: "oel41y"
}], ["path", {
	d: "m9 12 2 2 4-4",
	key: "dzmm74"
}]]), $u = Q("ShoppingBag", [
	["path", {
		d: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z",
		key: "hou9p0"
	}],
	["path", {
		d: "M3 6h18",
		key: "d0wm0j"
	}],
	["path", {
		d: "M16 10a4 4 0 0 1-8 0",
		key: "1ltviw"
	}]
]), ed = Q("Sigma", [["path", {
	d: "M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2",
	key: "wuwx1p"
}]]), td = Q("SlidersHorizontal", [
	["line", {
		x1: "21",
		x2: "14",
		y1: "4",
		y2: "4",
		key: "obuewd"
	}],
	["line", {
		x1: "10",
		x2: "3",
		y1: "4",
		y2: "4",
		key: "1q6298"
	}],
	["line", {
		x1: "21",
		x2: "12",
		y1: "12",
		y2: "12",
		key: "1iu8h1"
	}],
	["line", {
		x1: "8",
		x2: "3",
		y1: "12",
		y2: "12",
		key: "ntss68"
	}],
	["line", {
		x1: "21",
		x2: "16",
		y1: "20",
		y2: "20",
		key: "14d8ph"
	}],
	["line", {
		x1: "12",
		x2: "3",
		y1: "20",
		y2: "20",
		key: "m0wm8r"
	}],
	["line", {
		x1: "14",
		x2: "14",
		y1: "2",
		y2: "6",
		key: "14e1ph"
	}],
	["line", {
		x1: "8",
		x2: "8",
		y1: "10",
		y2: "14",
		key: "1i6ji0"
	}],
	["line", {
		x1: "16",
		x2: "16",
		y1: "18",
		y2: "22",
		key: "1lctlv"
	}]
]), nd = Q("Sparkles", [
	["path", {
		d: "M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z",
		key: "4pj2yx"
	}],
	["path", {
		d: "M20 3v4",
		key: "1olli1"
	}],
	["path", {
		d: "M22 5h-4",
		key: "1gvqau"
	}],
	["path", {
		d: "M4 17v2",
		key: "vumght"
	}],
	["path", {
		d: "M5 18H3",
		key: "zchphs"
	}]
]), rd = Q("Table", [
	["path", {
		d: "M12 3v18",
		key: "108xh3"
	}],
	["rect", {
		width: "18",
		height: "18",
		x: "3",
		y: "3",
		rx: "2",
		key: "afitv7"
	}],
	["path", {
		d: "M3 9h18",
		key: "1pudct"
	}],
	["path", {
		d: "M3 15h18",
		key: "5xshup"
	}]
]), id = Q("Target", [
	["circle", {
		cx: "12",
		cy: "12",
		r: "10",
		key: "1mglay"
	}],
	["circle", {
		cx: "12",
		cy: "12",
		r: "6",
		key: "1vlfrh"
	}],
	["circle", {
		cx: "12",
		cy: "12",
		r: "2",
		key: "1c9p78"
	}]
]), ad = Q("Terminal", [["polyline", {
	points: "4 17 10 11 4 5",
	key: "akl6gq"
}], ["line", {
	x1: "12",
	x2: "20",
	y1: "19",
	y2: "19",
	key: "q2wloq"
}]]), od = Q("TrendingUp", [["polyline", {
	points: "22 7 13.5 15.5 8.5 10.5 2 17",
	key: "126l90"
}], ["polyline", {
	points: "16 7 22 7 22 13",
	key: "kwv8wd"
}]]), sd = Q("Truck", [
	["path", {
		d: "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2",
		key: "wrbu53"
	}],
	["path", {
		d: "M15 18H9",
		key: "1lyqi6"
	}],
	["path", {
		d: "M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14",
		key: "lysw3i"
	}],
	["circle", {
		cx: "17",
		cy: "18",
		r: "2",
		key: "332jqn"
	}],
	["circle", {
		cx: "7",
		cy: "18",
		r: "2",
		key: "19iecd"
	}]
]), cd = Q("User", [["path", {
	d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2",
	key: "975kel"
}], ["circle", {
	cx: "12",
	cy: "7",
	r: "4",
	key: "17ys0d"
}]]), ld = Q("Users", [
	["path", {
		d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
		key: "1yyitq"
	}],
	["circle", {
		cx: "9",
		cy: "7",
		r: "4",
		key: "nufk8"
	}],
	["path", {
		d: "M22 21v-2a4 4 0 0 0-3-3.87",
		key: "kshegd"
	}],
	["path", {
		d: "M16 3.13a4 4 0 0 1 0 7.75",
		key: "1da9ce"
	}]
]), ud = Q("Wallet", [["path", {
	d: "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1",
	key: "18etb6"
}], ["path", {
	d: "M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4",
	key: "xoc0q4"
}]]), dd = Q("WandSparkles", [
	["path", {
		d: "m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72",
		key: "ul74o6"
	}],
	["path", {
		d: "m14 7 3 3",
		key: "1r5n42"
	}],
	["path", {
		d: "M5 6v4",
		key: "ilb8ba"
	}],
	["path", {
		d: "M19 14v4",
		key: "blhpug"
	}],
	["path", {
		d: "M10 2v2",
		key: "7u0qdc"
	}],
	["path", {
		d: "M7 8H3",
		key: "zfb6yr"
	}],
	["path", {
		d: "M21 16h-4",
		key: "1cnmox"
	}],
	["path", {
		d: "M11 3H9",
		key: "1obp7u"
	}]
]), fd = Q("Waves", [
	["path", {
		d: "M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
		key: "knzxuh"
	}],
	["path", {
		d: "M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
		key: "2jd2cc"
	}],
	["path", {
		d: "M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
		key: "rd2r6e"
	}]
]), pd = Q("Workflow", [
	["rect", {
		width: "8",
		height: "8",
		x: "3",
		y: "3",
		rx: "2",
		key: "by2w9f"
	}],
	["path", {
		d: "M7 11v4a2 2 0 0 0 2 2h4",
		key: "xkn7yn"
	}],
	["rect", {
		width: "8",
		height: "8",
		x: "13",
		y: "13",
		rx: "2",
		key: "1cgmvn"
	}]
]), md = Q("X", [["path", {
	d: "M18 6 6 18",
	key: "1bl5f8"
}], ["path", {
	d: "m6 6 12 12",
	key: "d8bk6v"
}]]), hd = {
	mark: "ROTFL",
	spaced: "R O T F L",
	letters: [
		{
			letter: "R",
			meaning: "Render"
		},
		{
			letter: "O",
			meaning: "On"
		},
		{
			letter: "T",
			meaning: "The"
		},
		{
			letter: "F",
			meaning: "Fly"
		},
		{
			letter: "L",
			meaning: ""
		}
	]
}, gd = Object.freeze([
	"ROOT",
	"BASE",
	"HOME",
	"COMDCCT"
]), _d = Object.freeze({
	ROOT: {
		short: "ROOT",
		label: "Root",
		blurb: "The business itself",
		semantics: "ESTABLISHED"
	},
	BASE: {
		short: "BASE",
		label: "Base",
		blurb: "Where you plan and connect",
		semantics: "ESTABLISHED"
	},
	HOME: {
		short: "HOME",
		label: "Home",
		blurb: "Where you build and live",
		semantics: "ESTABLISHED"
	},
	COMDCCT: {
		short: "COMDCCT",
		label: "Command",
		blurb: "Where you run and control it",
		semantics: "ESTABLISHED",
		semantics_source: "src/components/framework/registry.jsx",
		role: "control rail — every command and control surface hangs from it"
	}
});
Object.freeze({
	forward: gd,
	reverse: [...gd].reverse(),
	bidirectional: !0,
	rule: "a coordinate is legible from either end; the reverse walk must land on ROOT"
}), Object.freeze({
	primitive_owner: "xiio-handoff/x42/twist.mjs",
	transform: "T180",
	grammar: "t+[i]-c -> X -> c+[i]-t -> X -> RETURN",
	invariant: "T180 o T180 = HOME",
	mirror_hostile: "MIRROR_ONLY != X",
	admission_owner: "src/lib/crossingAdmission55.mjs",
	admission_api: "qualifyCrossing55",
	execution_api: "admitCrossingExecution",
	estate_governance_owner: "src/lib/hallbergEstateGovernance55.mjs",
	estate_governance_apis: Object.freeze([
		"crossEstate55",
		"qualifyEstateMutation",
		"qualifyReap",
		"conserveSourceIdentity"
	]),
	projection_transport_owner: "src/lib/hallbergProjectionTransport55.mjs",
	projection_transport_apis: Object.freeze([
		"wellDefinedOnSamples",
		"admitAffine",
		"encodeE",
		"decodeE",
		"transportTE",
		"commuteSample",
		"compositionLawSample"
	]),
	projection_transport_framework_peer: Object.freeze({
		repo: "Vado42-chris/xi-io.net",
		pr: 1281,
		module: "engines/rotfl/hallberg_coordinate_transport.py",
		check: "check:hallberg-coordinate-transport",
		hard: Object.freeze([
			"TEST_INCLUSION != PRODUCTION_IMPORT",
			"DRAFT_PR != MERGED_MAIN",
			"SAME_LAW != SAME_MODULE_DIGEST"
		])
	}),
	rotfl_runtime_owner: "src/lib/rotfl55TraversalRuntime.mjs",
	rotfl_runtime_apis: Object.freeze([
		"qualifyRotfl55",
		"executeRotfl55Traversal",
		"independent9sReturn"
	]),
	host_entry: "src/lib/leaveCubeHost.mjs",
	host_apis: Object.freeze([
		"leaveCube",
		"peekLeaveCube",
		"returnFromLeave"
	]),
	rotfl_contract_commit: "cff75df0785a04e2293122ba9f9d8940e5ac5a59",
	osforge_accept: Object.freeze(["K13", "K14"]),
	osforge_k14: "INFORMATION_ONLY_CROSSING",
	osforge_owner: "src/lib/osforgeKernel.mjs",
	admission_states: Object.freeze([
		"LOCAL_QUALIFIED_5S",
		"CROSSING_PENDING_5_5",
		"TRAVERSAL_ADMITTED_6S",
		"BLOCKED"
	]),
	rules: Object.freeze([
		"OUTPUT_A -> INPUT_B (never OUTPUT_A <-> OUTPUT_B)",
		"orientation returns home across two transforms",
		"lineage returns home; semantic root stays traceable",
		"generation may advance without losing lineage",
		"authority does not flip, nor appear, because orientation flips",
		"SEEING_ROUTE != ADMITTED_TO_TRAVEL",
		"QUALIFICATION != EXECUTION",
		"PEER_AGREEMENT != WARD_AUTHORIZATION",
		"PEER_VOTE != PASS",
		"qualifyCrossing55 → TRAVERSAL_ADMITTED_6S before T180",
		"admitCrossingExecution requires independent RETURN target"
	])
}), Object.freeze([
	"RESULT",
	"EXACT_VALIDATOR",
	"EXACT_CONFIG_BYTES",
	"EXACT_GENERATION",
	"EXACT_OWNER"
]), Object.freeze([
	"BRONZE",
	"SIVER",
	"GOLD",
	"PLATINUM"
]), Object.freeze({
	BRONZE: {
		label: "Bronze",
		blurb: "Everyday"
	},
	SIVER: {
		label: "Siver",
		blurb: "Working"
	},
	GOLD: {
		label: "Gold",
		blurb: "Advanced"
	},
	PLATINUM: {
		label: "Platinum",
		blurb: "Control"
	}
});
var vd = Object.freeze([
	{
		n: 1,
		label: "1s",
		axis: "both",
		note: "one atomic outward occurrence"
	},
	{
		n: 2,
		label: "2s",
		axis: "operator",
		note: "reciprocal return / compare / rebase"
	},
	{
		n: 3,
		label: "3s",
		axis: "operator",
		note: "SOW one qualified delta into its affected work"
	},
	{
		n: 4,
		label: "4s",
		axis: "operator",
		note: "NEED / FEED / REAP keep the active frontier level"
	},
	{
		n: 5,
		label: "5s",
		axis: "operator",
		note: "bounded cube pivot: reap the bounded projection at HOME, never HOME itself; sow typed ANTs, then collapse or expand"
	},
	{
		n: 10,
		label: "10s",
		axis: "scale",
		note: "a short burst of work"
	},
	{
		n: 100,
		label: "100s",
		axis: "scale",
		note: "a real job, start to finish"
	},
	{
		n: 1e3,
		label: "1,000s",
		axis: "scale",
		note: "a long run you can walk away from"
	},
	{
		n: 1e4,
		label: "10,000s",
		axis: "scale",
		note: "a background sweep"
	},
	{
		n: 1e5,
		label: "100,000s",
		axis: "scale",
		note: "a day-scale process"
	},
	{
		n: 1e6,
		label: "1,000,000s",
		axis: "scale",
		note: "a season-scale process"
	}
]);
Object.freeze(vd.map((e) => e.label)), Object.freeze(vd.map((e) => e.n));
var yd = Object.freeze(vd.filter((e) => e.axis !== "operator")), bd = Object.freeze(vd.filter((e) => e.axis !== "scale"));
Object.freeze(yd.map((e) => e.label)), Object.freeze(bd.map((e) => e.label)), Object.freeze([
	"MIRROR_ONLY",
	"WRONG_SIDE_COMPARE",
	"ROLE_NOT_TWISTED",
	"RETURN_NOT_REVERSED",
	"IDENTITY_DRIFT",
	"LINEAGE_LOSS",
	"AUTHORITY_APPEARS",
	"WRITE_ACK_WITHOUT_READBACK",
	"PROSE_SUCCESS_WITHOUT_EFFECT",
	"ARTIFACT_MISSING",
	"RETURN_TARGET_MISMATCH",
	"NEIGHBOUR_REGRESSION",
	"UNKNOWN_PROMOTED",
	"PARTIAL_DENOMINATOR_PROMOTED",
	"AMBIGUOUS_CANARY_SINGLE_PATH",
	"SURVIVOR_PROMOTED_TO_AUTHORITY",
	"HUMAN_OVERRIDE_DROPPED"
]), Object.freeze([
	{
		id: "A",
		name: "rendered lattice differs from canonical contract",
		verdict: "FAIL"
	},
	{
		id: "B",
		name: "AcsKernel differs from canonical contract",
		verdict: "FAIL"
	},
	{
		id: "C",
		name: "@ibal runtime coordinates differ from canonical contract",
		verdict: "FAIL"
	},
	{
		id: "D",
		name: "COMDCCT disappears",
		verdict: "FAIL"
	},
	{
		id: "E",
		name: "tier/scale ladder differs between consumers",
		verdict: "FAIL"
	},
	{
		id: "F",
		name: "durable projection generation is stale",
		verdict: "FAIL"
	},
	{
		id: "G",
		name: "write receipt exists without independent readback",
		verdict: "NO_EFFECT"
	},
	{
		id: "H",
		name: "partial denominator attempts promotion",
		verdict: "FAIL"
	},
	{
		id: "I",
		name: "UNKNOWN attempts promotion",
		verdict: "FAIL"
	},
	{
		id: "J",
		name: "optimization removes evidence",
		verdict: "DISQUALIFIED"
	},
	{
		id: "K",
		name: "mirror without X/T180",
		verdict: "FAIL"
	},
	{
		id: "L",
		name: "round trip does not return HOME",
		verdict: "FAIL"
	},
	{
		id: "M",
		name: "contract placements diverge",
		verdict: "FAIL"
	}
]), Object.freeze({
	rule: "FAIL or UNKNOWN blocks promotion",
	allow: Object.freeze(["PASS"]),
	blocking: Object.freeze([
		"FAIL",
		"UNKNOWN",
		"NO_EFFECT"
	]),
	no_inheritance: "BRONZE PASS != PLATINUM PASS; no level inherits runtime credit",
	must_be_whole: "a partial denominator may never promote"
}), Object.freeze({
	rule: "every batch retains its full denominator",
	optimization_rule: "optimize orchestration, never evidence denominator",
	may_reduce: Object.freeze([
		"orchestration",
		"duplicate work",
		"repeated setup",
		"equivalent structural work"
	]),
	may_never_reduce: Object.freeze([
		"evidence cells",
		"independent readback",
		"hostile diversity",
		"X crossings",
		"neighbour regression",
		"artifact/effect proof",
		"FAIL",
		"UNKNOWN"
	])
}), Object.freeze({
	n: 3,
	operator: "SOW",
	rule: "SOW consumes a qualified 1→2 delta and expands only the affected next work; it may not bypass reciprocal return/compare.",
	hard: Object.freeze(["SOW_WITHOUT_QUALIFIED_2=OUT_OF_CADENCE", "SOW_EXPANDS_AFFECTED_SET_NOT_GLOBAL_FRONTIER"])
}), Object.freeze({
	n: 4,
	operators: Object.freeze({
		NEED: "A nonterminal miner bucket names the exact missing input, wake, currentness, resource or dependency. Absence may never be silent.",
		FEED: "Route the exact qualified ANT, result or resource into the typed NEED that can consume it. FEED is not authority.",
		REAP: "Collapse spent, false, stale or superseded active carrier while preserving provenance and any qualified semantic delta."
	}),
	bucket_rule: "Every nonterminal bucket has runnable ANT fuel, emits a typed NEED, or is terminal/REAPED.",
	balance_rule: "Feed existing runnable NEED before widening that same frontier with more SOW; blocked external NEED does not starve independent work.",
	hard: Object.freeze([
		"SILENT_BUCKET=FAIL",
		"UNFED_RUNNABLE_NEED=STARVATION",
		"FEED_WITHOUT_TYPED_NEED=FLOOD_RISK",
		"REAP!=DELETE_PROVENANCE",
		"NEED!=OWNER_AS_CLOCK",
		"4S_KEEP_FRONTIER_LEVEL"
	])
}), Object.freeze({
	principle: "RED=ROUTING_INFORMATION; RED!=GLOBAL_STOP",
	classes: Object.freeze([
		"AFFECTED",
		"BLOCKED_BY",
		"INDEPENDENT",
		"ALTERNATE_ROUTE",
		"UNKNOWN",
		"READY"
	]),
	rules: Object.freeze([
		"BLOCK_ONLY_TRUE_DEPENDENCY_CONE",
		"READY+INDEPENDENT+QUALIFIED_ALTERNATE_ROUTE_KEEP_EXECUTING",
		"UNKNOWN_REMAINS_IN_DENOMINATOR",
		"STARVING_INDEPENDENT_WORK=PNEUMA_FAILURE",
		"GOLD_PROMOTION_STILL_REQUIRES_COMPLETE_DENOMINATOR"
	])
}), Object.freeze([
	"FASTER != LESS PROOF",
	"WRITE_ACK != READBACK",
	"PROSE SUCCESS != EFFECT",
	"NO_READBACK => NO_EFFECT",
	"FAIL_OR_UNKNOWN_BLOCKS_PROMOTION",
	"CLEAN_MUST_MATCH_REAL_TOPOLOGY",
	"RED!=GLOBAL_STOP",
	"BLOCK_ONLY_TRUE_DEPENDENCY_CONE",
	"STARVING_INDEPENDENT_WORK=PNEUMA_FAILURE",
	"SILENT_BUCKET=FAIL",
	"SEEING_ROUTE != ADMITTED_TO_TRAVEL",
	"QUALIFICATION != EXECUTION",
	"PEER_AGREEMENT != WARD_AUTHORIZATION",
	"PEER_VOTE != PASS",
	"ISOLATED_EQUATION_PAIR != COMPLETE_HALLBERGMATHS",
	"FRAGMENT_GATE != COMPLETE_HALLBERGMATHS",
	"DIAGRAM_INTERPRETATION != OPERATOR_DEFINITION",
	"OPENAI_PUBLICATIONS != INTERNAL_ARCHITECTURE_EQUIVALENCE",
	"MATH_PAPER_PASS != EXECUTABLE_KERNEL_CORRESPONDENCE",
	"CHILD_UNRESOLVED != PARENT_PASS",
	"REDUCED_RESULT != COMPLETE_SOURCE_STATE"
]), Object.freeze(/* @__PURE__ */ "     @ibal.     .     [ROOT].     [BASE][HOME][COMS]+[COMPASS][PAYLOAD]+[TIME][BILLING][DELIVERED].     ↕    ↕    ↕    ↕    ↕    ↕    ↕    ↕    ↕    ↓    ↕.          [  ]| !! | !! | !! | !! |  P N E U M A | !! | !! | !! |[   ]| !! | !! | .   ∞ ___________________________________________________∞.     |/   |   \\|/   |   \\|/   |   \\|/   |   \\|/   |   \\|.   ↪  X t+[i]-c X t+[i]-c X t+[i]-c X t+[i]-c X t+[i]-c X ↩.     |\\   ↕   /↕\\   ↕   /↕\\   ↕   /↕\\   ↕   /↕\\   ↕   /|.  ↔  1+\\  2+ / 3+\\  4+ / 5+\\  6+ / 7+\\  8+ / 9+\\  0+ / | ↔.     |  \\ ↕ /  ↕  \\ ↕ /  ↕  \\ ↕ /  ↕  \\ ↕ /  ↕  \\ ↕ /  ↕.     |   \\|/   |   \\|/   |   \\|/   |   \\|/   |   \\|/   | .  t+[i]-c X t+[i]-c X t+[i]-c X t+[i]-c X t+[i]-c X t+[i]-c.     |   /|\\   |   /|\\   |   /|\\   |   /|\\   |   /|\\   |.     |  / ↕ \\  ↕  / ↕ \\  ↕  / ↕ \\  ↕  / ↕ \\  ↕  / ↕ \\  ↕.  ↔ -0↔/-1↔ \\-2↔/ -3↔ \\-4↔/ -5 ↔\\-6↔/ -7↔ \\-8↔/ -9↔  \\ |.     |/   |   \\|/   |   \\|/   |   \\|/   |   \\|/   |   \\|.     i t+[i]-c X t+[i]-c X t+[i]-c X t+[i]-cX t+[i]-c  X .     |\\   |   /|\\   |   /|\\   |   /|\\   |   /|\\   |   /|.  ↔  0 \\ -9↔ /-8↔\\ -7↔ /-6↔\\ -5↔ /-4↔\\ -3↔ /-2↔\\ -1↔ / | ↔.     |  \\ ↕ /  ↕  \\ ↕ /  ↕  \\ ↕ /  ↕  \\ ↕ /  ↕  \\ ↕ /  ↕.     |   \\|/   |   \\|/   |   \\|/   |   \\|/   |   \\|/   |.  c+[i]-t X c+[i]-t X c+[i]-t X c+[i]-t X c+[i]-t X c+[i]-t.     |   /|\\   |   /|\\   |   /|\\   |   /|\\   |   /|\\   |.  ↔ -0  /-1↔\\ -2↔ /-3↔\\ -4↔ /-5↔\\ -6↔ /-7↔\\ -8↔ /-9↔\\  | ↔.     | /  |  \\ | /  |  \\ | /  |  \\ | /  |  \\ | /  |  \\ |.     |/   |   \\|/   |   \\|/   |   \\|/   |   \\|/   |   \\|.   ↪  X t+[i]-c X t+[i]-c X t+[i]-c X t+[i]-c X t+[i]-c X ↩  .     |\\   ↕   /↕\\   ↕   /↕\\   ↕   /↕\\   ↕   /↕\\   ↕   /|.  ↔  1+\\ ↔2+ /↔3+\\ ↔4+ /↔5+\\ ↔6+ /↔7+\\↔ 8+ /↔9+\\ ↔0+ / | ↔.     |  \\ ↕ /  ↕  \\ ↕ /  ↕  \\ ↕ /  ↕  \\ ↕ /  ↕  \\ ↕ /  ↕.     |   \\|/   |   \\|/   |   \\|/   |   \\|/   |   \\|/   | .     |   /|\\   |   /|\\   |   /|\\   |   /|\\   |   /|\\   |    .   ∞ |_________________________________________________|∞.     | !! | !! | !! | !! | P N E U M A  | !! | !! | !! |.     ↕    ↕    ↕    ↕    ↕    ↕    ↕    ↕    ↕    ↕    ↕    ..      [BRONZE][SIVER][GOLD][PLATINUM]    .      [1s],[10s][100s][1,000s][10,000s][100,000s][1,000,000s].      _______________________________________________________________________   .          [  ]| !! | !! | !! | !! |  P N E U M A | !! | !! | !! |[   ]| !! | !! | .      [1s] .      [2s].      [3s].      [4s].      [5s].      _______________________________________________________________________.      [pneuma] + [burn] + [triage].          [  ]| !! | !! | !! | !! |  P N E U M A | !! | !! | !! |[   ]| !! | !! | .      [heal].      .      [resume].      _______________________________________________________________________.      [pneuma] + [burn] + [triage].          [  ]| !! | !! | !! | !! |  P N E U M A | !! | !! | !! |[   ]| !! | !! | .      [heal].      .      [go!] {[HOME!]}.      .      +tic #date #time @crm, #bugs #tasks @dataforge .      +cogs #date_project #date_time @teams, #bug_wrangle, bug_excute!.      @ibal #reap +!gamify +!plan +!ship.      _______________________________________________________________________.       .           ↕    ↕    ↕    ↕    ↕    ↕    ↕    ↕    ↕    ↓      ↕             .          [  ]| !! | !! | !! | !! |  P N E U M A | !! | !! | !! |[   ]| !! | !! | .   ∞ ___________________________________________________∞.     |/   |   \\|/   |   \\|/   |   \\|/   |   \\|/   |   \\|.   ↪  X t+[i]-c X t+[i]-c X t+[i]-c X t+[i]-c X t+[i]-c X ↩.     |\\   ↕   /↕\\   ↕   /↕\\   ↕   /↕\\   ↕   /↕\\   ↕   /|.  ↔  1+\\  2+ / 3+\\  4+ / 5+\\  6+ / 7+\\  8+ / 9+\\  0+ / | ↔.     |  \\ ↕ /  ↕  \\ ↕ /  ↕  \\ ↕ /  ↕  \\ ↕ /  ↕  \\ ↕ /  ↕.     |   \\|/   |   \\|/   |   \\|/   |   \\|/   |   \\|/   | .  t+[i]-c X t+[i]-c X t+[i]-c X t+[i]-c X t+[i]-c X t+[i]-c.     |   /|\\   |   /|\\   |   /|\\   |   /|\\   |   /|\\   |.     |  / ↕ \\  ↕  / ↕ \\  ↕  / ↕ \\  ↕  / ↕ \\  ↕  / ↕ \\  ↕.  ↔ -0↔/-1↔ \\-2↔/ -3↔ \\-4↔/ -5 ↔\\-6↔/ -7↔ \\-8↔/ -9↔  \\ |.     |/   |   \\|/   |   \\|/   |   \\|/   |   \\|/   |   \\|.     i t+[i]-c X t+[i]-c X t+[i]-c X t+[i]-cX t+[i]-c  X .     |\\   |   /|\\   |   /|\\   |   /|\\   |   /|\\   |   /|.  ↔  0 \\ -9↔ /-8↔\\ -7↔ /-6↔\\ -5↔ /-4↔\\ -3↔ /-2↔\\ -1↔ / | ↔.     |  \\ ↕ /  ↕  \\ ↕ /  ↕  \\ ↕ /  ↕  \\ ↕ /  ↕  \\ ↕ /  ↕.     |   \\|/   |   \\|/   |   \\|/   |   \\|/   |   \\|/   |.  c+[i]-t X c+[i]-t X c+[i]-t X c+[i]-t X c+[i]-t X c+[i]-t.     |   /|\\   |   /|\\   |   /|\\   |   /|\\   |   /|\\   |.  ↔ -0  /-1↔\\ -2↔ /-3↔\\ -4↔ /-5↔\\ -6↔ /-7↔\\ -8↔ /-9↔\\  | ↔.     | /  |  \\ | /  |  \\ | /  |  \\ | /  |  \\ | /  |  \\ |.     |/   |   \\|/   |   \\|/   |   \\|/   |   \\|/   |   \\|.   ↪  X t+[i]-c X t+[i]-c X t+[i]-c X t+[i]-c X t+[i]-c X ↩  .     |\\   ↕   /↕\\   ↕   /↕\\   ↕   /↕\\   ↕   /↕\\   ↕   /|.  ↔  1+\\ ↔2+ /↔3+\\ ↔4+ /↔5+\\ ↔6+ /↔7+\\↔ 8+ /↔9+\\ ↔0+ / | ↔.     |  \\ ↕ /  ↕  \\ ↕ /  ↕  \\ ↕ /  ↕  \\ ↕ /  ↕  \\ ↕ /  ↕.     |   \\|/   |   \\|/   |   \\|/   |   \\|/   |   \\|/   | .     |   /|\\   |   /|\\   |   /|\\   |   /|\\   |   /|\\   |    .   ∞ |_________________________________________________|∞.     | !! | !! | !! | !! | P N E U M A  | !! | !! | !! |.     ↕    ↕    ↕    ↕    ↕    ↕    ↕    ↕    ↕    ↕    ↕   .     __________________________________________________.          [  ]| !! | !! | !! | !! |  P N E U M A | !! | !! | !! |[   ]| !! | !! | .     CONNECT SEAMS %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%###############.      _______________________________________________________________________.     $$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$###############".split(".")), Object.freeze({
	"t+[i]-c": "tick + index − cycle · the outward leg of the crossing",
	"c+[i]-t": "cycle + index − tick · the return leg, the inverse of the same crossing"
}), Object.freeze({
	sequence: Object.freeze([
		"pneuma",
		"burn",
		"triage",
		"heal",
		"resume"
	]),
	semantics: "ESTABLISHED_2026_09_27",
	stages: Object.freeze({
		pneuma: "Census current truth, retain the whole denominator, and keep every independently runnable path moving.",
		burn: "Run the applicable cells and hostiles; a red is routing information, not a project-wide stop.",
		triage: "Partition the denominator into AFFECTED, BLOCKED_BY, INDEPENDENT, ALTERNATE_ROUTE, UNKNOWN and READY.",
		heal: "Repair or reroute the damaged seam inside its true blast radius, then obtain readback.",
		resume: "Reconnect the healed seam, run newly unblocked work, return HOME, account tics/cogs/tasks/bugs, REAP, plan and ship."
	}),
	post_go: Object.freeze([
		"HOME",
		"TIC_COG_ACCOUNTING",
		"CRM_BUGS_TASKS",
		"TEAMS_WRANGLE_EXECUTE",
		"REAP_GAMIFY_PLAN_SHIP",
		"CONNECT_SEAMS"
	])
}), Object.freeze({
	schema: "xiio.pneuma.steering/v1",
	rung: "00s",
	is: "the recursive steering formation that conducts each exponential 1s scale",
	is_not: Object.freeze([
		"a batch size",
		"100 independent workers",
		"100 human-visible results"
	]),
	recurrence: Object.freeze([
		"1s",
		"00s",
		"10s",
		"00s",
		"100s",
		"00s",
		"1,000s",
		"00s",
		"10,000s",
		"00s",
		"100,000s",
		"00s",
		"1,000,000s"
	]),
	chain: Object.freeze([
		"ADDRESS",
		"1s BINARY_DECOMPOSITION",
		"3x3x3 RECIPROCAL_COVERAGE",
		"00s FORMATION",
		"QUANTIZE_EQUIVALENT_TRUTH",
		"FRACTALIZE_DISTINCT_REDS",
		"x42/x43 PROJECTION_AS_QUALIFIED",
		"NEXT_EXPONENTIAL_SCALE",
		"PNEUMA",
		"CONNECT_SEAMS",
		"PPTM",
		"BURN_TRIAGE_HEAL_RESUME",
		"RESULT_RETURN_READBACK_REAP",
		"HOME_0",
		"NEXT_1"
	]),
	operations: Object.freeze({
		QUANTIZE: "compress structurally equivalent truth",
		FRACTALIZE: "expand materially distinct reds",
		CROSS: "hostile reciprocal crossings",
		PRESERVE: "preserve provenance",
		SUPPRESS: "suppress unnecessary human projection"
	}),
	pptm: Object.freeze({
		rule: "PPTM belongs inside the steering calculation, not after the work as reporting.",
		operators: Object.freeze([
			"PROJ",
			"PRIORITY",
			"TIME",
			"MONEY"
		])
	}),
	literal_operators: Object.freeze(["x42", "x43"]),
	literal_rule: "x42 and x43 remain literal until qualified; their presence is supplied operating grammar, never a definition",
	home: "Studio is always ROOT for every tool @ibal needs for a 1 to become a 0 again and reset the stacks",
	semantics: "ESTABLISHED_2026_09_28"
}), Object.freeze({
	rule: "COMPUTATIONAL SCALE rises exponentially; HUMAN COG LOAD must not rise proportionally.",
	hard: Object.freeze([
		"MORE_SCALE != MORE_HUMAN_INTERRUPTION",
		"MORE_AGENTS != MORE_WINDOWS",
		"MORE_RESULTS != MORE_OWNER_DECISIONS",
		"SUBTERRANEAN_WORK_STAYS_HEADLESS",
		"ONLY_OWED_QUALITATIVE_CROSSINGS_RISE_INTO_STUDIO"
	]),
	routing: "MORE_1s -> STRONGER_00s -> STRONGER_FAN_IN -> FEWER_BETTER_HUMAN_CROSSINGS"
}), Object.freeze([
	"src/components/framework/PneumaLattice.jsx",
	"src/components/framework/registry.jsx",
	"src/components/config/ConfigQualificationPanel.jsx",
	"src/components/config/ConfigScaleLadder.jsx",
	"base44/shared/configSimContract.mjs",
	"scripts/run-pneuma-batch.mjs",
	"base44/agents/Ibal.jsonc",
	"src/components/acs/PneumaCube.jsx",
	"src/lib/pneumaLattice.js",
	"src/components/framework/publisher.jsx"
]);
// ../shared-node/src/components/framework/registry.jsx
var xd = {
	ROOT: {
		..._d.ROOT,
		icon: hu,
		colour: "brand",
		bg: "bg-[hsl(var(--color-brand))]",
		text: "text-[hsl(var(--color-brand))]"
	},
	BASE: {
		..._d.BASE,
		icon: id,
		colour: "blue-600",
		bg: "bg-blue-600",
		text: "text-blue-600"
	},
	HOME: {
		..._d.HOME,
		icon: Iu,
		colour: "rose-500",
		bg: "bg-rose-500",
		text: "text-rose-500"
	},
	COMDCCT: {
		..._d.COMDCCT,
		icon: Vu,
		colour: "neutral-600",
		bg: "bg-neutral-600",
		text: "text-neutral-600"
	}
};
Object.freeze(["app", "product"]), hd.mark, hd.letters, Object.fromEntries(vd.map((e) => [e.label, e.note]));
var Sd = [
	{
		id: "Home",
		name: "Gateway",
		route: "Home",
		anchor: "ROOT",
		tier: "BRONZE",
		horizon: "10s",
		icon: bu,
		plain: "Where you start, and what the estate is doing"
	},
	{
		id: "SearchResults",
		name: "Web Search",
		route: "SearchResults",
		anchor: "ROOT",
		tier: "BRONZE",
		horizon: "100s",
		icon: qu,
		plain: "Search the open web from inside the estate"
	},
	{
		id: "Dashboard",
		name: "Overview",
		route: "Dashboard",
		anchor: "ROOT",
		tier: "SIVER",
		horizon: "100s",
		icon: wu,
		plain: "Your key numbers in one place"
	},
	{
		id: "Analytics",
		name: "Analytics",
		route: "Analytics",
		anchor: "ROOT",
		tier: "SIVER",
		horizon: "1,000s",
		icon: od,
		plain: "Traffic and usage over time"
	},
	{
		id: "Intelligence",
		name: "Intelligence",
		route: "Intelligence",
		anchor: "ROOT",
		tier: "GOLD",
		horizon: "1,000s",
		icon: Gl,
		plain: "Insights drawn from your own data"
	},
	{
		id: "CRM",
		name: "CRM",
		route: "CRM",
		anchor: "ROOT",
		tier: "SIVER",
		horizon: "100s",
		icon: cd,
		plain: "Contacts, customers and their history"
	},
	{
		id: "Communications",
		name: "Comms",
		route: "Communications",
		anchor: "ROOT",
		tier: "BRONZE",
		horizon: "100s",
		icon: ku,
		plain: "Messages, campaigns and social"
	},
	{
		id: "Commerce",
		name: "Commerce",
		route: "Commerce",
		anchor: "ROOT",
		tier: "SIVER",
		horizon: "100s",
		icon: sd,
		plain: "Products, orders and stock"
	},
	{
		id: "Finance",
		name: "Finance",
		route: "Finance",
		anchor: "ROOT",
		tier: "GOLD",
		horizon: "1,000s",
		icon: ud,
		plain: "Money in, money out, and what is owed"
	},
	{
		id: "Archives",
		name: "Archives",
		route: "Archives",
		anchor: "ROOT",
		tier: "BRONZE",
		horizon: "10,000s",
		icon: vu,
		plain: "Long-term storage and old versions"
	},
	{
		id: "Legal",
		name: "Legal",
		route: "Legal",
		anchor: "ROOT",
		tier: "SIVER",
		horizon: "10,000s",
		icon: Gu,
		plain: "Matters, documents and obligations"
	},
	{
		id: "Stories",
		name: "Case Studies",
		route: "Stories",
		anchor: "ROOT",
		tier: "BRONZE",
		horizon: "10s",
		icon: Nu,
		plain: "What the estate measured about itself, and what it still owes"
	},
	{
		id: "BusinessPlan",
		name: "Business Plan",
		route: "BusinessPlan",
		anchor: "BASE",
		tier: "SIVER",
		horizon: "10,000s",
		icon: Du,
		plain: "Where the business is going, and the steps to get there"
	},
	{
		id: "Enterprise",
		name: "Enterprise",
		route: "Enterprise",
		anchor: "BASE",
		tier: "GOLD",
		horizon: "10,000s",
		icon: Ul,
		plain: "Company-wide structure, teams and roles"
	},
	{
		id: "Automation",
		name: "Automation",
		route: "Automation",
		anchor: "BASE",
		tier: "GOLD",
		horizon: "1,000s",
		icon: pd,
		plain: "Work that runs itself on a trigger or a schedule"
	},
	{
		id: "Integrations",
		name: "Integrations",
		route: "Integrations",
		anchor: "BASE",
		tier: "SIVER",
		horizon: "100s",
		icon: Ru,
		plain: "Connect outside services to the estate"
	},
	{
		id: "IntegrationDashboard",
		name: "Integrations Dashboard",
		route: "IntegrationDashboard",
		anchor: "BASE",
		tier: "GOLD",
		horizon: "1,000s",
		icon: Cu,
		plain: "Health of every connected service"
	},
	{
		id: "Marketplace",
		name: "Marketplace",
		route: "Marketplace",
		anchor: "BASE",
		tier: "SIVER",
		horizon: "1,000s",
		icon: $u,
		plain: "Browse and install things other people built"
	},
	{
		id: "ListingAdmission",
		name: "Listing Admission",
		route: "ListingAdmission",
		anchor: "BASE",
		tier: "SIVER",
		horizon: "1,000s",
		icon: Qu,
		plain: "Admit a product to the shop, or name what it is still owed"
	},
	{
		id: "Services",
		name: "Services & Tiers",
		route: "Services",
		anchor: "BASE",
		tier: "SIVER",
		horizon: "1,000s",
		icon: _u,
		plain: "What we offer everyone, and what each concierge tier adds each month"
	},
	{
		id: "Wiring",
		name: "The Wiring",
		route: "Wiring",
		anchor: "BASE",
		tier: "GOLD",
		horizon: "1,000s",
		icon: Wl,
		plain: "Every tool family, the records behind it, and the face it feeds"
	},
	{
		id: "SimMaze",
		name: "Sim-Maze",
		route: "SimMaze",
		anchor: "BASE",
		tier: "GOLD",
		horizon: "1s",
		icon: Du,
		plain: "One wall at a time: the current contract, the target, the four bounded paths and the one continue gate"
	},
	{
		id: "ConciergeCanary",
		name: "Concierge Service",
		route: "ConciergeCanary",
		anchor: "BASE",
		tier: "SIVER",
		horizon: "1,000s",
		icon: _u,
		plain: "What the software does for you, and what we do with you"
	},
	{
		id: "Connect",
		name: "Connect AI",
		route: "Connect",
		anchor: "BASE",
		tier: "BRONZE",
		horizon: "100s",
		icon: Ru,
		plain: "Point an AI you already use at this estate"
	},
	{
		id: "AiSetup",
		name: "AI Setup",
		route: "AiSetup",
		anchor: "BASE",
		tier: "BRONZE",
		horizon: "100s",
		icon: nd,
		plain: "Configure AI Mail and the models the estate answers with"
	},
	{
		id: "ApiDocs",
		name: "API Reference",
		route: "ApiDocs",
		anchor: "BASE",
		tier: "BRONZE",
		horizon: "100s",
		icon: Bl,
		plain: "The entities and endpoints this estate exposes"
	},
	{
		id: "Metadata",
		name: "Metadata",
		route: "Metadata",
		anchor: "BASE",
		tier: "BRONZE",
		horizon: "100s",
		icon: ed,
		plain: "Every entity, every field, and the formulas you can run over them"
	},
	{
		id: "BaseWindows",
		name: "Window Programs",
		route: "BaseWindows",
		anchor: "BASE",
		tier: "SIVER",
		horizon: "100s",
		icon: Nl,
		plain: "Address every open window"
	},
	{
		id: "FractalAntChains",
		name: "Ant Chains",
		route: "FractalAntChains",
		anchor: "BASE",
		tier: "SIVER",
		horizon: "10,000s",
		icon: mu,
		plain: "Map each receipt ladder to its parent artifact"
	},
	{
		id: "MyWork",
		name: "My Work",
		route: "MyWork",
		anchor: "HOME",
		tier: "BRONZE",
		horizon: "10s",
		icon: Xl,
		plain: "Your own dockets and tasks — plan the work you chose, and move it on"
	},
	{
		id: "Sprints",
		name: "Sprints",
		route: "Sprints",
		anchor: "HOME",
		tier: "BRONZE",
		horizon: "100s",
		icon: Eu,
		plain: "The sprint itself: what is planned, what the ledger actually has, and who is holding it"
	},
	{
		id: "WorkRoom",
		name: "Work Room",
		route: "WorkRoom",
		anchor: "HOME",
		tier: "BRONZE",
		horizon: "1,000s",
		icon: Su,
		plain: "Tasks, boards and who is on what"
	},
	{
		id: "DistroBuilder",
		name: "Distro Builder",
		route: "DistroBuilder",
		anchor: "HOME",
		tier: "GOLD",
		horizon: "100,000s",
		icon: nu,
		plain: "Build and version a distributable of your work"
	},
	{
		id: "Studio",
		name: "Studio",
		route: "Studio",
		anchor: "HOME",
		tier: "SIVER",
		horizon: "1,000s",
		icon: Fu,
		plain: "Create and edit documents, media and code"
	},
	{
		id: "DraughtTable",
		name: "Drafts Table",
		route: "DraughtTable",
		anchor: "HOME",
		tier: "SIVER",
		horizon: "1,000s",
		icon: rd,
		plain: "Draft work on the same addressable plane as windows, widgets, tools and the active artifact"
	},
	{
		id: "Produce",
		name: "Produce",
		route: "Produce",
		anchor: "HOME",
		tier: "SIVER",
		horizon: "1,000s",
		icon: iu,
		plain: "From the first file to what comes back — every step, in order"
	},
	{
		id: "PneumaStudio",
		name: "Studio Shell",
		route: "PneumaStudio",
		anchor: "HOME",
		tier: "SIVER",
		horizon: "1,000s",
		icon: Fl,
		plain: "The whole estate composed as one workspace"
	},
	{
		id: "ContentManager",
		name: "Site Builder",
		route: "ContentManager",
		anchor: "HOME",
		tier: "SIVER",
		horizon: "1,000s",
		icon: Il,
		plain: "Build and publish pages for a site"
	},
	{
		id: "ComponentForge",
		name: "Component Forge",
		route: "ComponentForge",
		anchor: "HOME",
		tier: "GOLD",
		horizon: "1,000s",
		icon: dd,
		plain: "Design and reuse interface components"
	},
	{
		id: "RoundTripCanary",
		name: "Round-Trip Canary",
		route: "RoundTripCanary",
		anchor: "HOME",
		tier: "SIVER",
		horizon: "1,000s",
		icon: Xu,
		plain: "One artifact, edited by hand, walked through every station and reconciled"
	},
	{
		id: "Roundtrip",
		name: "Roundtrip",
		route: "Roundtrip",
		anchor: "HOME",
		tier: "SIVER",
		horizon: "100s",
		icon: Uu,
		plain: "One conversation, two seats: the window you talk in, and the pinned seat that runs on your own model"
	},
	{
		id: "Agents",
		name: "Agents",
		route: "Agents",
		anchor: "HOME",
		tier: "SIVER",
		horizon: "1,000s",
		icon: Rl,
		plain: "The workers that act on your behalf"
	},
	{
		id: "Community",
		name: "Community",
		route: "Community",
		anchor: "HOME",
		tier: "BRONZE",
		horizon: "10,000s",
		icon: ld,
		plain: "People, groups and shared work"
	},
	{
		id: "Network",
		name: "Network",
		route: "Network",
		anchor: "HOME",
		tier: "GOLD",
		horizon: "10,000s",
		icon: Mu,
		plain: "How your machines and services reach each other"
	},
	{
		id: "Nodes",
		name: "Nodes",
		route: "Nodes",
		anchor: "HOME",
		tier: "GOLD",
		horizon: "10,000s",
		icon: zl,
		plain: "The machines this estate runs on"
	},
	{
		id: "Lifestyle",
		name: "Lifestyle",
		route: "Lifestyle",
		anchor: "HOME",
		tier: "BRONZE",
		horizon: "10,000s",
		icon: Zl,
		plain: "Personal life — home, family and routines"
	},
	{
		id: "Onboarding",
		name: "Client Onboarding",
		route: "Onboarding",
		anchor: "HOME",
		tier: "SIVER",
		horizon: "10,000s",
		icon: Xl,
		plain: "Set a client up: their people, domain, server and site — and what each step still owes"
	},
	{
		id: "EstateBrain",
		name: "Estate Brain",
		route: "EstateBrain",
		anchor: "COMDCCT",
		group: "Observe",
		tier: "PLATINUM",
		horizon: "100s",
		icon: Vl,
		adminOnly: !0,
		plain: "System-wide state and coordination"
	},
	{
		id: "BugLedger",
		name: "Issue Ledger",
		route: "BugLedger",
		anchor: "COMDCCT",
		group: "Observe",
		tier: "PLATINUM",
		horizon: "10,000s",
		icon: Hl,
		plain: "Every issue raised, and whether the trackers hold it"
	},
	{
		id: "Console",
		name: "Console",
		route: "Console",
		anchor: "COMDCCT",
		tier: "PLATINUM",
		horizon: "100s",
		icon: Ql,
		adminOnly: !0,
		plain: "The live stream of what the system is doing"
	},
	{
		id: "Logs",
		name: "Logs",
		route: "Logs",
		anchor: "COMDCCT",
		group: "Observe",
		tier: "PLATINUM",
		horizon: "100s",
		icon: Ku,
		adminOnly: !0,
		plain: "What the estate is failing at, on both halves of Obsidian OS"
	},
	{
		id: "Emergency",
		name: "Emergency",
		route: "Emergency",
		anchor: "COMDCCT",
		tier: "PLATINUM",
		horizon: "1s",
		icon: Zu,
		adminOnly: !0,
		plain: "Stop everything, now"
	},
	{
		id: "ReaperSpace",
		name: "Reaper Space",
		route: "ReaperSpace",
		anchor: "COMDCCT",
		group: "Recover",
		tier: "PLATINUM",
		horizon: "100,000s",
		icon: du,
		adminOnly: !0,
		plain: "Cleanup, recovery and stale-work removal"
	},
	{
		id: "Identity",
		name: "Identity",
		route: "Identity",
		anchor: "COMDCCT",
		tier: "PLATINUM",
		horizon: "10s",
		icon: ou,
		adminOnly: !0,
		plain: "Who you are, and what you are allowed to do"
	},
	{
		id: "SovereignAccounts",
		name: "Team & Accounts",
		route: "SovereignAccounts",
		anchor: "COMDCCT",
		tier: "PLATINUM",
		horizon: "10s",
		icon: ld,
		adminOnly: !0,
		plain: "Invite teammates and admit or suspend accounts"
	},
	{
		id: "DomainRegistry",
		name: "Domains",
		route: "DomainRegistry",
		anchor: "COMDCCT",
		tier: "PLATINUM",
		horizon: "1s",
		icon: hu,
		adminOnly: !0,
		plain: "What this estate owns and when it lapses"
	},
	{
		id: "Sites",
		name: "Sites",
		route: "Sites",
		anchor: "HOME",
		tier: "PLATINUM",
		horizon: "1s",
		icon: Il,
		plain: "Every site you own, and how it is doing"
	},
	{
		id: "ApiShop",
		name: "API Shop",
		route: "ApiShop",
		anchor: "ROOT",
		tier: "PLATINUM",
		horizon: "1s",
		icon: Wl,
		plain: "Shop the operations this project needs and register its own API page"
	},
	{
		id: "Settings",
		name: "System Config",
		route: "Settings",
		anchor: "COMDCCT",
		tier: "PLATINUM",
		horizon: "100s",
		icon: Yu,
		plain: "How the whole system behaves for everyone"
	},
	{
		id: "UserSettings",
		name: "User Settings",
		route: "UserSettings",
		anchor: "COMDCCT",
		tier: "PLATINUM",
		horizon: "100s",
		icon: td,
		plain: "Your own preferences, carried across devices"
	},
	{
		id: "Audit",
		name: "System Audit",
		route: "Audit",
		anchor: "COMDCCT",
		tier: "PLATINUM",
		horizon: "10,000s",
		icon: au,
		adminOnly: !0,
		plain: "What changed, when, and who did it"
	},
	{
		id: "ServerControl",
		name: "Server Control",
		route: "ServerControl",
		anchor: "COMDCCT",
		tier: "GOLD",
		horizon: "100,000s",
		icon: Ju,
		plain: "Start, stop and configure the services behind the estate"
	},
	{
		id: "Installer",
		name: "Uplink Installer",
		route: "Installer",
		anchor: "COMDCCT",
		group: "Connect",
		tier: "PLATINUM",
		horizon: "1,000s",
		icon: ru,
		plain: "Connect and install external capabilities"
	},
	{
		id: "FigmaRegistry",
		name: "Figma Registry",
		route: "FigmaRegistry",
		anchor: "COMDCCT",
		group: "Connect",
		tier: "PLATINUM",
		horizon: "1,000s",
		icon: Pu,
		plain: "Publish the design system to Figma's npm registry"
	},
	{
		id: "OllamaBridge",
		name: "Local Models",
		route: "OllamaBridge",
		anchor: "COMDCCT",
		group: "Connect",
		tier: "PLATINUM",
		horizon: "1,000s",
		icon: $l,
		plain: "Bridge the estate to the models on your own machine"
	},
	{
		id: "SwarmHealth",
		name: "Swarm Health",
		route: "SwarmHealth",
		anchor: "COMDCCT",
		group: "Connect",
		tier: "GOLD",
		horizon: "100s",
		icon: Bu,
		plain: "Both local runtimes, what they hold, and what is owed"
	},
	{
		id: "Docs",
		name: "Manual",
		route: "Docs",
		anchor: "COMDCCT",
		tier: "BRONZE",
		horizon: "100s",
		icon: Ll,
		plain: "How to use the estate, written down"
	},
	{
		id: "Doctrine",
		name: "Doctrine",
		route: "Doctrine",
		anchor: "COMDCCT",
		tier: "BRONZE",
		horizon: "100s",
		icon: Tu,
		plain: "The architecture this estate is built on, section by section"
	},
	{
		id: "AxiomRegistry",
		name: "Axiom Registry",
		route: "AxiomRegistry",
		anchor: "COMDCCT",
		tier: "PLATINUM",
		horizon: "10,000s",
		icon: Eu,
		plain: "Every invariant, which section cites it, and what is owed"
	},
	{
		id: "WardSecurityCanary",
		name: "Ward",
		route: "WardSecurityCanary",
		anchor: "COMDCCT",
		group: "Protect",
		tier: "GOLD",
		horizon: "100s",
		icon: Qu,
		plain: "Your protection: identity, pass-through and the vault — and what is still owed"
	},
	{
		id: "AckLedger",
		name: "Agent Control",
		route: "AckLedger",
		anchor: "COMDCCT",
		tier: "PLATINUM",
		horizon: "1,000s",
		icon: Ku,
		adminOnly: !0,
		plain: "Every handshake an agent has made"
	},
	{
		id: "AcsKernel",
		name: "Agent Kernel",
		route: "AcsKernel",
		anchor: "COMDCCT",
		group: "Control",
		tier: "PLATINUM",
		horizon: "10,000s",
		icon: Yl,
		adminOnly: !0,
		plain: "Core agent runtime and control logic"
	},
	{
		id: "Census",
		name: "Census",
		route: "Census",
		anchor: "COMDCCT",
		tier: "PLATINUM",
		horizon: "10,000s",
		icon: rd,
		adminOnly: !0,
		plain: "Every product in the portfolio, counted"
	},
	{
		id: "EstateHistory",
		name: "History",
		route: "EstateHistory",
		anchor: "COMDCCT",
		group: "Observe",
		tier: "PLATINUM",
		horizon: "100,000s",
		icon: Ku,
		plain: "What this estate has actually done, week by week, with the unrecorded weeks named"
	},
	{
		id: "BlastWave",
		name: "Blast Wave",
		route: "BlastWave",
		anchor: "COMDCCT",
		group: "Observe",
		tier: "PLATINUM",
		horizon: "10,000s",
		icon: fd,
		plain: "The next four weeks read against what is already built, with the contradictions named"
	},
	{
		id: "FeatureCensus",
		name: "Promise Census",
		route: "FeatureCensus",
		anchor: "COMDCCT",
		group: "Observe",
		tier: "PLATINUM",
		horizon: "10,000s",
		icon: Eu,
		adminOnly: !0,
		plain: "Compare promised features with observed delivery"
	},
	{
		id: "LiveReport",
		name: "Live Report",
		route: "LiveReport",
		anchor: "COMDCCT",
		tier: "PLATINUM",
		horizon: "1,000,000s",
		icon: uu,
		adminOnly: !0,
		plain: "The estate's current state, updating as it runs"
	},
	{
		id: "RecoverySchedule",
		name: "Recovery",
		route: "RecoverySchedule",
		anchor: "COMDCCT",
		tier: "PLATINUM",
		horizon: "10,000s",
		icon: fu,
		plain: "Bring work back after something breaks"
	},
	{
		id: "TriageTunnels",
		name: "Triage Tunnels",
		route: "TriageTunnels",
		anchor: "COMDCCT",
		tier: "PLATINUM",
		horizon: "100s",
		icon: Ml,
		plain: "Work that is stuck, stalled or waiting on someone"
	},
	{
		id: "RotflMonitor",
		name: "ROTFL Monitor",
		route: "RotflMonitor",
		anchor: "COMDCCT",
		group: "Observe",
		tier: "PLATINUM",
		horizon: "100s",
		icon: yu,
		adminOnly: !0,
		plain: "Loop health, return and recovery monitor"
	},
	{
		id: "GoldenWindow",
		name: "Golden Window",
		route: "GoldenWindow",
		anchor: "COMDCCT",
		group: "Project",
		tier: "PLATINUM",
		horizon: "100s",
		icon: Nl,
		adminOnly: !0,
		plain: "Project-start template, drawn from its recipe"
	},
	{
		id: "Burnmap",
		name: "Burnmap",
		route: "Burnmap",
		anchor: "COMDCCT",
		group: "Observe",
		tier: "PLATINUM",
		horizon: "100s",
		icon: su,
		adminOnly: !0,
		plain: "Health of all 27 maze cells, read live"
	},
	{
		id: "ProductFormation",
		name: "Launch Formation",
		route: "ProductFormation",
		anchor: "COMDCCT",
		tier: "PLATINUM",
		horizon: "10,000s",
		icon: Wu,
		adminOnly: !0,
		plain: "Take a product from idea to launch"
	},
	{
		id: "SplitBrainAudit",
		name: "Split-Brain Audit",
		route: "SplitBrainAudit",
		anchor: "COMDCCT",
		group: "Audit",
		tier: "PLATINUM",
		horizon: "1,000s",
		icon: zu,
		adminOnly: !0,
		plain: "Find conflicting copies of system truth"
	},
	{
		id: "HexProjection",
		name: "HEX Projection",
		route: "HexProjection",
		anchor: "COMDCCT",
		group: "Project",
		tier: "PLATINUM",
		horizon: "1,000s",
		icon: Nl,
		adminOnly: !0,
		plain: "Project one addressed state into another view"
	},
	{
		id: "DataPlane",
		name: "Data Plane",
		route: "DataPlane",
		anchor: "COMDCCT",
		tier: "PLATINUM",
		horizon: "10,000s",
		icon: tu,
		adminOnly: !0,
		plain: "Where data comes from, goes, and gets stored"
	},
	{
		id: "DesignTruth",
		name: "Design Truth",
		route: "DesignTruth",
		anchor: "COMDCCT",
		tier: "PLATINUM",
		horizon: "10,000s",
		icon: eu,
		adminOnly: !0,
		plain: "Whether the interface matches the design it claims"
	},
	{
		id: "PrimitiveCensus",
		name: "Primitive Census",
		route: "PrimitiveCensus",
		anchor: "COMDCCT",
		group: "Audit",
		tier: "PLATINUM",
		horizon: "10,000s",
		icon: Cu,
		adminOnly: !0,
		plain: "Inventory reusable interface and system primitives"
	},
	{
		id: "HotFolders",
		name: "Hot Folders",
		route: "HotFolders",
		anchor: "HOME",
		tier: "GOLD",
		horizon: "1,000s",
		icon: cu,
		plain: "Folders that process files as they arrive"
	},
	{
		id: "Bins",
		name: "Bins",
		route: "Bins",
		anchor: "ROOT",
		tier: "SIVER",
		horizon: "10,000s",
		icon: Pl,
		plain: "Everything on Drive, with its real path"
	},
	{
		id: "PortfolioCensus",
		name: "Portfolio Census",
		route: "PortfolioCensus",
		anchor: "BASE",
		tier: "PLATINUM",
		horizon: "100,000s",
		icon: pu,
		adminOnly: !0,
		plain: "Every repository, and what it is worth keeping"
	},
	{
		id: "FileManager",
		name: "File System",
		route: null,
		anchor: "COMDCCT",
		tier: "BRONZE",
		horizon: "10s",
		icon: cu,
		plain: "Browse and move files",
		tabs: [{
			id: "files",
			label: "Files",
			icon: lu
		}]
	},
	{
		id: "Terminal",
		name: "Terminal",
		route: null,
		anchor: "COMDCCT",
		tier: "PLATINUM",
		horizon: "100s",
		icon: ad,
		plain: "Run commands directly",
		tabs: [{
			id: "main",
			label: "Terminal",
			icon: ad
		}]
	},
	{
		id: "SystemMonitor",
		name: "System Monitor",
		route: null,
		anchor: "COMDCCT",
		tier: "GOLD",
		horizon: "10s",
		icon: Ml,
		plain: "Live resource use of this machine",
		tabs: [{
			id: "main",
			label: "Monitor",
			icon: Ml
		}]
	},
	{
		id: "Switchboard",
		name: "Switchboard",
		route: null,
		anchor: "HOME",
		tier: "SIVER",
		horizon: "1,000s",
		icon: Hu,
		plain: "Route agent work to the right lane",
		tabs: [{
			id: "board",
			label: "Agents",
			icon: Hu
		}]
	},
	{
		id: "Inbox",
		name: "Inbox",
		route: null,
		anchor: "HOME",
		tier: "BRONZE",
		horizon: "100s",
		icon: xu,
		plain: "Mail and messages waiting on you",
		tabs: [{
			id: "mail",
			label: "Mail",
			icon: xu
		}]
	}
], Cd = Object.freeze(/* @__PURE__ */ "Home.SearchResults.Dashboard.Analytics.Intelligence.CRM.Communications.Commerce.Finance.Archives.Legal.Bins.Stories.BusinessPlan.Enterprise.Automation.Integrations.Marketplace.Wiring.SimMaze.AiSetup.Metadata.Services.WorkRoom.Studio.Roundtrip.Produce.ContentManager.DistroBuilder.Agents.HotFolders.Community.Network.Nodes.Lifestyle.Onboarding.Console.Logs.Emergency.Identity.Settings.UserSettings.ServerControl.Installer.Docs.BugLedger.EstateHistory.BlastWave.Census.PrimitiveCensus.FeatureCensus.Audit.PortfolioCensus".split("."));
new Set(Cd);
// ../shared-node/src/lib/surfaceIdentity.mjs
var wd = "xiio.surface-identity/v1", Td = Object.freeze({
	DECLARED: "DECLARED",
	SURFACE: "SURFACE",
	ANCHOR: "ANCHOR",
	NONE: "NONE"
}), Ed = (e) => Sd.find((t) => t.id === e) || null;
function Dd({ surfaceId: e = null, category: t = null, title: n = null } = {}) {
	let r = e ? Ed(e) : null, i = r ? xd[r.anchor] : null, a = n ?? r?.name ?? null, o = t ?? r?.category ?? i?.label ?? null, s = t == null ? r?.category == null ? i?.label == null ? Td.NONE : Td.ANCHOR : Td.SURFACE : Td.DECLARED, c = n == null ? r?.name == null ? Td.NONE : Td.SURFACE : Td.DECLARED, l = o != null && a != null;
	return {
		schema: wd,
		ref: r ? `pane:${r.id}` : `pane:unknown:${a ?? "unnamed"}`,
		surface_id: r?.id ?? null,
		anchor: r?.anchor ?? null,
		category: o,
		title: a,
		category_source: s,
		title_source: c,
		resolved: l,
		first_red: l ? null : o == null ? "CATEGORY_UNRESOLVED" : "TITLE_UNRESOLVED"
	};
}
// ../shared-node/src/lib/paneContract.mjs
var Od = Object.freeze({
	CANVAS: {
		holds: "panes",
		is: "the field a composition sits on",
		consumer: "the editor, the desktop, the article surface"
	},
	PANE: {
		holds: "blocks, or a single surface",
		is: "a surface of its own — resizable, pinnable, with scroll regions it owns",
		consumer: "project, canvas, tools, chat, settings, inspector, layers, Bins, Glass Box, citations, comments, AI context",
		law: "src/lib/desktopPane.mjs — a pane is anything that occupies a rect and may be joined"
	},
	DRAWER: {
		holds: "tools",
		is: "the column where a tool is CHOSEN",
		consumer: "the tool drawer, the settings rail, the layers list",
		law: "src/lib/surfaceEscalation.mjs"
	},
	FLYOUT: {
		holds: "an expanded tool",
		is: "a panel hanging off the row that opened it, so the row stays on screen",
		consumer: "a tool whose panel does not fit the column it was chosen in",
		law: "src/lib/surfaceEscalation.mjs — FLYOUT_ANCHOR"
	},
	DOCK: {
		holds: "drawers",
		is: "the edge a drawer is docked to",
		consumer: "the shell"
	},
	TOOL: {
		holds: "one control",
		is: "a row",
		consumer: "every action in the estate"
	},
	TOOLGROUP: {
		holds: "tools",
		is: "the categorisation a squished drawer owes — NOT a shape",
		consumer: "any drawer holding more rows than it can show",
		law: "src/lib/squishRule.mjs — rows that do not fit are CATEGORISED, never grown"
	},
	INSPECTOR: {
		holds: "the settings of the current SELECTION",
		is: "a pane whose subject is another pane",
		consumer: "the Z2 drawer, the property editor"
	},
	SELECTION: {
		holds: "one or more addressable nodes",
		is: "what the INSPECTOR is reading, and the reason its tools changed",
		consumer: "the editor, the canvas, the desktop"
	},
	SNAPTARGET: {
		holds: "a rect a pane may come flush to",
		is: "an entry in the neighbour set the join maths already takes",
		consumer: "every pane, including the tool drawer",
		law: "src/lib/desktopSnap.mjs — snapToNeighbors"
	},
	PROJECTION: {
		holds: "a pane read at another width or on another device",
		is: "the SAME pane wearing its other arrangement, never a second pane",
		consumer: "mobile, tablet, desktop, satellite, export",
		law: "src/lib/columnScreen.mjs — PARTITION ≠ ARRANGEMENT"
	}
});
Object.freeze(Object.keys(Od)), Object.freeze({
	MOBILE: {
		panes: 1,
		is: "one column, one pane — the single-pane PROOF",
		proves: "that this pane is valid alone"
	},
	TABLET: {
		panes: "several, each mobile-width",
		is: "the canonical composition / UX design surface — HOME",
		proves: "that these panes are valid together, at the width each was designed for"
	},
	DESKTOP: {
		panes: "the same panes, snapped into a larger workspace",
		is: "the multi-pane PROJECTION",
		proves: "that the panes compose when they are all on screen at once"
	}
});
var kd = Object.freeze({
	PAPER: {
		is: "the working artifact",
		rule: "SOLID, always — glass over the work is glass spent saying nothing"
	},
	GLASS: {
		is: "the inspection / context boundary",
		rule: "where the user looks AT the work"
	},
	UNDER_GLASS: {
		is: "execution, provenance, Bins, AST, telemetry, system state",
		rule: "readable, and never in front of the work"
	}
}), Ad = Object.freeze({
	canvas: "PAPER",
	article: "PAPER",
	document: "PAPER",
	editor: "PAPER",
	spreadsheet: "PAPER",
	inspector: "GLASS",
	tools: "GLASS",
	drawer: "GLASS",
	chat: "GLASS",
	citations: "GLASS",
	comments: "GLASS",
	"ai-context": "GLASS",
	glassbox: "UNDER_GLASS",
	bins: "UNDER_GLASS",
	ast: "UNDER_GLASS",
	telemetry: "UNDER_GLASS",
	provenance: "UNDER_GLASS",
	"system-state": "UNDER_GLASS"
});
function jd(e) {
	let t = Ad[e];
	return t ? {
		surface: e,
		side: t,
		...kd[t],
		classified: !0
	} : {
		surface: e,
		side: "UNCLASSIFIED",
		classified: !1,
		detail: "no side of the boundary was declared — glass is not applied on a guess"
	};
}
Object.freeze([
	"WIREFRAME",
	"MATERIAL",
	"FINISHED"
]), Object.freeze({
	WIREFRAME: "a border says \"these are different things\"",
	MATERIAL: "surface / depth / spacing says \"these are different things\"",
	FINISHED: "the relationship is understandable without the border"
}), Object.freeze([
	"DRAG_THING_INTO_PROJECT",
	"ATTACH_ID_AND_METADATA",
	"RESOLVE_CAPABILITIES",
	"RESOLVE_PERMITTED_TOOLS",
	"Z2_DRAWER",
	"ESCALATE_DRAWER_TO_FLYOUT_TO_PANE",
	"SAME_PANE_SNAPS_BESIDE_CHAT_ON_DESKTOP",
	"SAME_PANE_OCCUPIES_THE_SCREEN_ON_MOBILE"
]), Object.freeze({
	"TEXT NODE": [
		"typography",
		"alignment",
		"colour",
		"spacing",
		"transform",
		"styles",
		"accessibility"
	],
	"IMAGE NODE": [
		"crop",
		"resize",
		"position",
		"mask",
		"effects",
		"metadata",
		"provenance"
	],
	"EXHIBIT NODE": [
		"source",
		"citation",
		"page",
		"annotation",
		"evidence relationship",
		"Bins provenance"
	]
}), Object.freeze([
	"Button",
	"IconButton",
	"Toggle",
	"Select",
	"Field",
	"Slider",
	"Tabs",
	"Menu",
	"Disclosure",
	"Handle",
	"DragTarget",
	"ResizeHandle",
	"DockTarget",
	"Close",
	"Pin",
	"PopOut",
	"Snap",
	"Undo",
	"Redo"
]), Object.freeze([
	"SDK_ATOMIC_PRIMITIVES",
	"ARTICLE_OR_TEMPLATE",
	"EDIT_WITH_REAL_WYSIWYG_TOOLS",
	"PUBLISHER_COMPOSITION",
	"MICROSITE",
	"HEX_OFFERING_DOOR",
	"MARKETPLACE"
]), Object.freeze([
	"no three responsive versions — one partition, one arrangement function",
	"no new information architecture on desktop — only more X-space for the same panes",
	"a surface that exists only on one device is a PARTITION change wearing an arrangement's clothes",
	"glass is a boundary, never decoration — solid over the working artifact, always",
	"an unclassified surface is reported, never assumed to be GLASS",
	"a structural line is REMOVED, never styled over",
	"too many rows is a missing CATEGORY, not a reason to escalate (squishRule.repair)",
	"nothing grows itself — escalate RETURNS a shape, it does not set one",
	"a primitive that hand-rolls a control is a second control wearing the first one's name",
	"no feature invents its own responsive implementation — chat, tools, settings, inspector, layers, Bins, Glass Box, citations, comments and AI context all consume the same panes"
]), Object.freeze([
	"that any surface in the estate has been READ against this contract — the census is OWED",
	"not yet proven that the component names reported by earlier agents implement this law, in this tree or in any other",
	"that the structural lines have been removed anywhere — the ladder is declared, the work is OWED",
	"not yet proven that every surface has a declared GLASS side",
	"not yet proven that the attach path has been exercised end to end from a drag to a snapped pane",
	"not yet proven that the front door has been rebuilt from these primitives"
]), typeof window < "u" && window.document && window.document.createElement;
function $(e, t, { checkForDefaultPrevented: n = !0 } = {}) {
	return function(r) {
		if (e?.(r), n === !1 || !r.defaultPrevented) return t?.(r);
	};
}
// ../build-deps/node_modules/@radix-ui/react-context/dist/index.mjs
function Md(t, n = []) {
	let r = [];
	function i(n, i) {
		let a = e.createContext(i), o = r.length;
		r = [...r, i];
		let s = (n) => {
			let { scope: r, children: i, ...s } = n, c = r?.[t]?.[o] || a, l = e.useMemo(() => s, Object.values(s));
			return /* @__PURE__ */ v(c.Provider, {
				value: l,
				children: i
			});
		};
		s.displayName = n + "Provider";
		function c(r, s) {
			let c = s?.[t]?.[o] || a, l = e.useContext(c);
			if (l) return l;
			if (i !== void 0) return i;
			throw Error(`\`${r}\` must be used within \`${n}\``);
		}
		return [s, c];
	}
	let a = () => {
		let n = r.map((t) => e.createContext(t));
		return function(r) {
			let i = r?.[t] || n;
			return e.useMemo(() => ({ [`__scope${t}`]: {
				...r,
				[t]: i
			} }), [r, i]);
		};
	};
	return a.scopeName = t, [i, Nd(a, ...n)];
}
function Nd(...t) {
	let n = t[0];
	if (t.length === 1) return n;
	let r = () => {
		let r = t.map((e) => ({
			useScope: e(),
			scopeName: e.scopeName
		}));
		return function(t) {
			let i = r.reduce((e, { useScope: n, scopeName: r }) => {
				let i = n(t)[`__scope${r}`];
				return {
					...e,
					...i
				};
			}, {});
			return e.useMemo(() => ({ [`__scope${n.scopeName}`]: i }), [i]);
		};
	};
	return r.scopeName = n.scopeName, r;
}
// ../build-deps/node_modules/@radix-ui/react-compose-refs/dist/index.mjs
function Pd(e, t) {
	if (typeof e == "function") return e(t);
	e != null && (e.current = t);
}
function Fd(...e) {
	return (t) => {
		let n = !1, r = e.map((e) => {
			let r = Pd(e, t);
			return !n && typeof r == "function" && (n = !0), r;
		});
		if (n) return () => {
			for (let t = 0; t < r.length; t++) {
				let n = r[t];
				typeof n == "function" ? n() : Pd(e[t], null);
			}
		};
	};
}
function Id(...t) {
	return e.useCallback(Fd(...t), t);
}
// ../build-deps/node_modules/@radix-ui/react-slot/dist/index.mjs
// @__NO_SIDE_EFFECTS__
function Ld(t) {
	let n = /* @__PURE__ */ Rd(t), r = e.forwardRef((t, r) => {
		let { children: i, ...a } = t, o = e.Children.toArray(i), s = o.find(Bd);
		if (s) {
			let t = s.props.children, i = o.map((n) => n === s ? e.Children.count(t) > 1 ? e.Children.only(null) : e.isValidElement(t) ? t.props.children : null : n);
			return /* @__PURE__ */ v(n, {
				...a,
				ref: r,
				children: e.isValidElement(t) ? e.cloneElement(t, void 0, i) : null
			});
		}
		return /* @__PURE__ */ v(n, {
			...a,
			ref: r,
			children: i
		});
	});
	return r.displayName = `${t}.Slot`, r;
}
// @__NO_SIDE_EFFECTS__
function Rd(t) {
	let n = e.forwardRef((t, n) => {
		let { children: r, ...i } = t;
		if (e.isValidElement(r)) {
			let t = Hd(r), a = Vd(i, r.props);
			return r.type !== e.Fragment && (a.ref = n ? Fd(n, t) : t), e.cloneElement(r, a);
		}
		return e.Children.count(r) > 1 ? e.Children.only(null) : null;
	});
	return n.displayName = `${t}.SlotClone`, n;
}
var zd = Symbol("radix.slottable");
function Bd(t) {
	return e.isValidElement(t) && typeof t.type == "function" && "__radixId" in t.type && t.type.__radixId === zd;
}
function Vd(e, t) {
	let n = { ...t };
	for (let r in t) {
		let i = e[r], a = t[r];
		/^on[A-Z]/.test(r) ? i && a ? n[r] = (...e) => {
			let t = a(...e);
			return i(...e), t;
		} : i && (n[r] = i) : r === "style" ? n[r] = {
			...i,
			...a
		} : r === "className" && (n[r] = [i, a].filter(Boolean).join(" "));
	}
	return {
		...e,
		...n
	};
}
function Hd(e) {
	let t = Object.getOwnPropertyDescriptor(e.props, "ref")?.get, n = t && "isReactWarning" in t && t.isReactWarning;
	return n ? e.ref : (t = Object.getOwnPropertyDescriptor(e, "ref")?.get, n = t && "isReactWarning" in t && t.isReactWarning, n ? e.props.ref : e.props.ref || e.ref);
}
// ../build-deps/node_modules/@radix-ui/react-primitive/dist/index.mjs
var Ud = [
	"a",
	"button",
	"div",
	"form",
	"h2",
	"h3",
	"img",
	"input",
	"label",
	"li",
	"nav",
	"ol",
	"p",
	"select",
	"span",
	"svg",
	"ul"
].reduce((t, n) => {
	let r = /* @__PURE__ */ Ld(`Primitive.${n}`), i = e.forwardRef((e, t) => {
		let { asChild: i, ...a } = e, o = i ? r : n;
		return typeof window < "u" && (window[Symbol.for("radix-ui")] = !0), /* @__PURE__ */ v(o, {
			...a,
			ref: t
		});
	});
	return i.displayName = `Primitive.${n}`, {
		...t,
		[n]: i
	};
}, {});
function Wd(e, t) {
	e && x.flushSync(() => e.dispatchEvent(t));
}
// ../build-deps/node_modules/@radix-ui/react-collection/dist/index.mjs
function Gd(e) {
	let n = e + "CollectionProvider", [r, i] = Md(n), [a, o] = r(n, {
		collectionRef: { current: null },
		itemMap: /* @__PURE__ */ new Map()
	}), s = (e) => {
		let { scope: n, children: r } = e, i = t.useRef(null), o = t.useRef(/* @__PURE__ */ new Map()).current;
		return /* @__PURE__ */ v(a, {
			scope: n,
			itemMap: o,
			collectionRef: i,
			children: r
		});
	};
	s.displayName = n;
	let c = e + "CollectionSlot", l = /* @__PURE__ */ Ld(c), u = t.forwardRef((e, t) => {
		let { scope: n, children: r } = e, i = Id(t, o(c, n).collectionRef);
		return /* @__PURE__ */ v(l, {
			ref: i,
			children: r
		});
	});
	u.displayName = c;
	let d = e + "CollectionItemSlot", f = "data-radix-collection-item", p = /* @__PURE__ */ Ld(d), m = t.forwardRef((e, n) => {
		let { scope: r, children: i, ...a } = e, s = t.useRef(null), c = Id(n, s), l = o(d, r);
		return t.useEffect(() => (l.itemMap.set(s, {
			ref: s,
			...a
		}), () => void l.itemMap.delete(s))), /* @__PURE__ */ v(p, {
			[f]: "",
			ref: c,
			children: i
		});
	});
	m.displayName = d;
	function h(n) {
		let r = o(e + "CollectionConsumer", n);
		return t.useCallback(() => {
			let e = r.collectionRef.current;
			if (!e) return [];
			let t = Array.from(e.querySelectorAll(`[${f}]`));
			return Array.from(r.itemMap.values()).sort((e, n) => t.indexOf(e.ref.current) - t.indexOf(n.ref.current));
		}, [r.collectionRef, r.itemMap]);
	}
	return [
		{
			Provider: s,
			Slot: u,
			ItemSlot: m
		},
		h,
		i
	];
}
// ../build-deps/node_modules/@radix-ui/react-direction/dist/index.mjs
var Kd = e.createContext(void 0);
function qd(t) {
	let n = e.useContext(Kd);
	return t || n || "ltr";
}
// ../build-deps/node_modules/@radix-ui/react-use-callback-ref/dist/index.mjs
function Jd(t) {
	let n = e.useRef(t);
	return e.useEffect(() => {
		n.current = t;
	}), e.useMemo(() => (...e) => n.current?.(...e), []);
}
// ../build-deps/node_modules/@radix-ui/react-use-escape-keydown/dist/index.mjs
function Yd(t, n = globalThis?.document) {
	let r = Jd(t);
	e.useEffect(() => {
		let e = (e) => {
			e.key === "Escape" && r(e);
		};
		return n.addEventListener("keydown", e, { capture: !0 }), () => n.removeEventListener("keydown", e, { capture: !0 });
	}, [r, n]);
}
// ../build-deps/node_modules/@radix-ui/react-dismissable-layer/dist/index.mjs
var Xd = "DismissableLayer", Zd = "dismissableLayer.update", Qd = "dismissableLayer.pointerDownOutside", $d = "dismissableLayer.focusOutside", ef, tf = e.createContext({
	layers: /* @__PURE__ */ new Set(),
	layersWithOutsidePointerEventsDisabled: /* @__PURE__ */ new Set(),
	branches: /* @__PURE__ */ new Set()
}), nf = e.forwardRef((t, n) => {
	let { disableOutsidePointerEvents: r = !1, onEscapeKeyDown: i, onPointerDownOutside: a, onFocusOutside: o, onInteractOutside: s, onDismiss: c, ...l } = t, u = e.useContext(tf), [d, f] = e.useState(null), p = d?.ownerDocument ?? globalThis?.document, [, m] = e.useState({}), h = Id(n, (e) => f(e)), g = Array.from(u.layers), [_] = [...u.layersWithOutsidePointerEventsDisabled].slice(-1), y = g.indexOf(_), b = d ? g.indexOf(d) : -1, x = u.layersWithOutsidePointerEventsDisabled.size > 0, S = b >= y, C = of((e) => {
		let t = e.target, n = [...u.branches].some((e) => e.contains(t));
		S && !n && (a?.(e), s?.(e), e.defaultPrevented || c?.());
	}, p), w = sf((e) => {
		let t = e.target;
		[...u.branches].some((e) => e.contains(t)) || (o?.(e), s?.(e), e.defaultPrevented || c?.());
	}, p);
	return Yd((e) => {
		b === u.layers.size - 1 && (i?.(e), !e.defaultPrevented && c && (e.preventDefault(), c()));
	}, p), e.useEffect(() => {
		if (d) return r && (u.layersWithOutsidePointerEventsDisabled.size === 0 && (ef = p.body.style.pointerEvents, p.body.style.pointerEvents = "none"), u.layersWithOutsidePointerEventsDisabled.add(d)), u.layers.add(d), cf(), () => {
			r && u.layersWithOutsidePointerEventsDisabled.size === 1 && (p.body.style.pointerEvents = ef);
		};
	}, [
		d,
		p,
		r,
		u
	]), e.useEffect(() => () => {
		d && (u.layers.delete(d), u.layersWithOutsidePointerEventsDisabled.delete(d), cf());
	}, [d, u]), e.useEffect(() => {
		let e = () => m({});
		return document.addEventListener(Zd, e), () => document.removeEventListener(Zd, e);
	}, []), /* @__PURE__ */ v(Ud.div, {
		...l,
		ref: h,
		style: {
			pointerEvents: x ? S ? "auto" : "none" : void 0,
			...t.style
		},
		onFocusCapture: $(t.onFocusCapture, w.onFocusCapture),
		onBlurCapture: $(t.onBlurCapture, w.onBlurCapture),
		onPointerDownCapture: $(t.onPointerDownCapture, C.onPointerDownCapture)
	});
});
nf.displayName = Xd;
var rf = "DismissableLayerBranch", af = e.forwardRef((t, n) => {
	let r = e.useContext(tf), i = e.useRef(null), a = Id(n, i);
	return e.useEffect(() => {
		let e = i.current;
		if (e) return r.branches.add(e), () => {
			r.branches.delete(e);
		};
	}, [r.branches]), /* @__PURE__ */ v(Ud.div, {
		...t,
		ref: a
	});
});
af.displayName = rf;
function of(t, n = globalThis?.document) {
	let r = Jd(t), i = e.useRef(!1), a = e.useRef(() => {});
	return e.useEffect(() => {
		let e = (e) => {
			if (e.target && !i.current) {
				let t = function() {
					lf(Qd, r, i, { discrete: !0 });
				}, i = { originalEvent: e };
				e.pointerType === "touch" ? (n.removeEventListener("click", a.current), a.current = t, n.addEventListener("click", a.current, { once: !0 })) : t();
			} else n.removeEventListener("click", a.current);
			i.current = !1;
		}, t = window.setTimeout(() => {
			n.addEventListener("pointerdown", e);
		}, 0);
		return () => {
			window.clearTimeout(t), n.removeEventListener("pointerdown", e), n.removeEventListener("click", a.current);
		};
	}, [n, r]), { onPointerDownCapture: () => i.current = !0 };
}
function sf(t, n = globalThis?.document) {
	let r = Jd(t), i = e.useRef(!1);
	return e.useEffect(() => {
		let e = (e) => {
			e.target && !i.current && lf($d, r, { originalEvent: e }, { discrete: !1 });
		};
		return n.addEventListener("focusin", e), () => n.removeEventListener("focusin", e);
	}, [n, r]), {
		onFocusCapture: () => i.current = !0,
		onBlurCapture: () => i.current = !1
	};
}
function cf() {
	let e = new CustomEvent(Zd);
	document.dispatchEvent(e);
}
function lf(e, t, n, { discrete: r }) {
	let i = n.originalEvent.target, a = new CustomEvent(e, {
		bubbles: !1,
		cancelable: !0,
		detail: n
	});
	t && i.addEventListener(e, t, { once: !0 }), r ? Wd(i, a) : i.dispatchEvent(a);
}
// ../build-deps/node_modules/@radix-ui/react-focus-guards/dist/index.mjs
var uf = 0;
function df() {
	e.useEffect(() => {
		let e = document.querySelectorAll("[data-radix-focus-guard]");
		return document.body.insertAdjacentElement("afterbegin", e[0] ?? ff()), document.body.insertAdjacentElement("beforeend", e[1] ?? ff()), uf++, () => {
			uf === 1 && document.querySelectorAll("[data-radix-focus-guard]").forEach((e) => e.remove()), uf--;
		};
	}, []);
}
function ff() {
	let e = document.createElement("span");
	return e.setAttribute("data-radix-focus-guard", ""), e.tabIndex = 0, e.style.outline = "none", e.style.opacity = "0", e.style.position = "fixed", e.style.pointerEvents = "none", e;
}
// ../build-deps/node_modules/@radix-ui/react-focus-scope/dist/index.mjs
var pf = "focusScope.autoFocusOnMount", mf = "focusScope.autoFocusOnUnmount", hf = {
	bubbles: !1,
	cancelable: !0
}, gf = "FocusScope", _f = e.forwardRef((t, n) => {
	let { loop: r = !1, trapped: i = !1, onMountAutoFocus: a, onUnmountAutoFocus: o, ...s } = t, [c, l] = e.useState(null), u = Jd(a), d = Jd(o), f = e.useRef(null), p = Id(n, (e) => l(e)), m = e.useRef({
		paused: !1,
		pause() {
			this.paused = !0;
		},
		resume() {
			this.paused = !1;
		}
	}).current;
	e.useEffect(() => {
		if (i) {
			let e = function(e) {
				if (m.paused || !c) return;
				let t = e.target;
				c.contains(t) ? f.current = t : wf(f.current, { select: !0 });
			}, t = function(e) {
				if (m.paused || !c) return;
				let t = e.relatedTarget;
				t !== null && (c.contains(t) || wf(f.current, { select: !0 }));
			}, n = function(e) {
				if (document.activeElement === document.body) for (let t of e) t.removedNodes.length > 0 && wf(c);
			};
			document.addEventListener("focusin", e), document.addEventListener("focusout", t);
			let r = new MutationObserver(n);
			return c && r.observe(c, {
				childList: !0,
				subtree: !0
			}), () => {
				document.removeEventListener("focusin", e), document.removeEventListener("focusout", t), r.disconnect();
			};
		}
	}, [
		i,
		c,
		m.paused
	]), e.useEffect(() => {
		if (c) {
			Tf.add(m);
			let e = document.activeElement;
			if (!c.contains(e)) {
				let t = new CustomEvent(pf, hf);
				c.addEventListener(pf, u), c.dispatchEvent(t), t.defaultPrevented || (vf(Of(bf(c)), { select: !0 }), document.activeElement === e && wf(c));
			}
			return () => {
				c.removeEventListener(pf, u), setTimeout(() => {
					let t = new CustomEvent(mf, hf);
					c.addEventListener(mf, d), c.dispatchEvent(t), t.defaultPrevented || wf(e ?? document.body, { select: !0 }), c.removeEventListener(mf, d), Tf.remove(m);
				}, 0);
			};
		}
	}, [
		c,
		u,
		d,
		m
	]);
	let h = e.useCallback((e) => {
		if (!r && !i || m.paused) return;
		let t = e.key === "Tab" && !e.altKey && !e.ctrlKey && !e.metaKey, n = document.activeElement;
		if (t && n) {
			let t = e.currentTarget, [i, a] = yf(t);
			i && a ? !e.shiftKey && n === a ? (e.preventDefault(), r && wf(i, { select: !0 })) : e.shiftKey && n === i && (e.preventDefault(), r && wf(a, { select: !0 })) : n === t && e.preventDefault();
		}
	}, [
		r,
		i,
		m.paused
	]);
	return /* @__PURE__ */ v(Ud.div, {
		tabIndex: -1,
		...s,
		ref: p,
		onKeyDown: h
	});
});
_f.displayName = gf;
function vf(e, { select: t = !1 } = {}) {
	let n = document.activeElement;
	for (let r of e) if (wf(r, { select: t }), document.activeElement !== n) return;
}
function yf(e) {
	let t = bf(e);
	return [xf(t, e), xf(t.reverse(), e)];
}
function bf(e) {
	let t = [], n = document.createTreeWalker(e, NodeFilter.SHOW_ELEMENT, { acceptNode: (e) => {
		let t = e.tagName === "INPUT" && e.type === "hidden";
		return e.disabled || e.hidden || t ? NodeFilter.FILTER_SKIP : e.tabIndex >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
	} });
	for (; n.nextNode();) t.push(n.currentNode);
	return t;
}
function xf(e, t) {
	for (let n of e) if (!Sf(n, { upTo: t })) return n;
}
function Sf(e, { upTo: t }) {
	if (getComputedStyle(e).visibility === "hidden") return !0;
	for (; e;) {
		if (t !== void 0 && e === t) return !1;
		if (getComputedStyle(e).display === "none") return !0;
		e = e.parentElement;
	}
	return !1;
}
function Cf(e) {
	return e instanceof HTMLInputElement && "select" in e;
}
function wf(e, { select: t = !1 } = {}) {
	if (e && e.focus) {
		let n = document.activeElement;
		e.focus({ preventScroll: !0 }), e !== n && Cf(e) && t && e.select();
	}
}
var Tf = Ef();
function Ef() {
	let e = [];
	return {
		add(t) {
			let n = e[0];
			t !== n && n?.pause(), e = Df(e, t), e.unshift(t);
		},
		remove(t) {
			e = Df(e, t), e[0]?.resume();
		}
	};
}
function Df(e, t) {
	let n = [...e], r = n.indexOf(t);
	return r !== -1 && n.splice(r, 1), n;
}
function Of(e) {
	return e.filter((e) => e.tagName !== "A");
}
// ../build-deps/node_modules/@radix-ui/react-use-layout-effect/dist/index.mjs
var kf = globalThis?.document ? e.useLayoutEffect : () => {}, Af = e.useId || (() => void 0), jf = 0;
function Mf(t) {
	let [n, r] = e.useState(Af());
	return kf(() => {
		t || r((e) => e ?? String(jf++));
	}, [t]), t || (n ? `radix-${n}` : "");
}
// ../build-deps/node_modules/@floating-ui/utils/dist/floating-ui.utils.mjs
var Nf = [
	"top",
	"right",
	"bottom",
	"left"
], Pf = Math.min, Ff = Math.max, If = Math.round, Lf = Math.floor, Rf = (e) => ({
	x: e,
	y: e
}), zf = {
	left: "right",
	right: "left",
	bottom: "top",
	top: "bottom"
}, Bf = {
	start: "end",
	end: "start"
};
function Vf(e, t, n) {
	return Ff(e, Pf(t, n));
}
function Hf(e, t) {
	return typeof e == "function" ? e(t) : e;
}
function Uf(e) {
	return e.split("-")[0];
}
function Wf(e) {
	return e.split("-")[1];
}
function Gf(e) {
	return e === "x" ? "y" : "x";
}
function Kf(e) {
	return e === "y" ? "height" : "width";
}
var qf = /*#__PURE__*/ new Set(["top", "bottom"]);
function Jf(e) {
	return qf.has(Uf(e)) ? "y" : "x";
}
function Yf(e) {
	return Gf(Jf(e));
}
function Xf(e, t, n) {
	n === void 0 && (n = !1);
	let r = Wf(e), i = Yf(e), a = Kf(i), o = i === "x" ? r === (n ? "end" : "start") ? "right" : "left" : r === "start" ? "bottom" : "top";
	return t.reference[a] > t.floating[a] && (o = ap(o)), [o, ap(o)];
}
function Zf(e) {
	let t = ap(e);
	return [
		Qf(e),
		t,
		Qf(t)
	];
}
function Qf(e) {
	return e.replace(/start|end/g, (e) => Bf[e]);
}
var $f = ["left", "right"], ep = ["right", "left"], tp = ["top", "bottom"], np = ["bottom", "top"];
function rp(e, t, n) {
	switch (e) {
		case "top":
		case "bottom": return n ? t ? ep : $f : t ? $f : ep;
		case "left":
		case "right": return t ? tp : np;
		default: return [];
	}
}
function ip(e, t, n, r) {
	let i = Wf(e), a = rp(Uf(e), n === "start", r);
	return i && (a = a.map((e) => e + "-" + i), t && (a = a.concat(a.map(Qf)))), a;
}
function ap(e) {
	return e.replace(/left|right|bottom|top/g, (e) => zf[e]);
}
function op(e) {
	return {
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
		...e
	};
}
function sp(e) {
	return typeof e == "number" ? {
		top: e,
		right: e,
		bottom: e,
		left: e
	} : op(e);
}
function cp(e) {
	let { x: t, y: n, width: r, height: i } = e;
	return {
		width: r,
		height: i,
		top: n,
		left: t,
		right: t + r,
		bottom: n + i,
		x: t,
		y: n
	};
}
// ../build-deps/node_modules/@floating-ui/core/dist/floating-ui.core.mjs
function lp(e, t, n) {
	let { reference: r, floating: i } = e, a = Jf(t), o = Yf(t), s = Kf(o), c = Uf(t), l = a === "y", u = r.x + r.width / 2 - i.width / 2, d = r.y + r.height / 2 - i.height / 2, f = r[s] / 2 - i[s] / 2, p;
	switch (c) {
		case "top":
			p = {
				x: u,
				y: r.y - i.height
			};
			break;
		case "bottom":
			p = {
				x: u,
				y: r.y + r.height
			};
			break;
		case "right":
			p = {
				x: r.x + r.width,
				y: d
			};
			break;
		case "left":
			p = {
				x: r.x - i.width,
				y: d
			};
			break;
		default: p = {
			x: r.x,
			y: r.y
		};
	}
	switch (Wf(t)) {
		case "start":
			p[o] -= f * (n && l ? -1 : 1);
			break;
		case "end": p[o] += f * (n && l ? -1 : 1);
	}
	return p;
}
var up = async (e, t, n) => {
	let { placement: r = "bottom", strategy: i = "absolute", middleware: a = [], platform: o } = n, s = a.filter(Boolean), c = await (o.isRTL == null ? void 0 : o.isRTL(t)), l = await o.getElementRects({
		reference: e,
		floating: t,
		strategy: i
	}), { x: u, y: d } = lp(l, r, c), f = r, p = {}, m = 0;
	for (let n = 0; n < s.length; n++) {
		let { name: a, fn: h } = s[n], { x: g, y: _, data: v, reset: y } = await h({
			x: u,
			y: d,
			initialPlacement: r,
			placement: f,
			strategy: i,
			middlewareData: p,
			rects: l,
			platform: o,
			elements: {
				reference: e,
				floating: t
			}
		});
		u = g ?? u, d = _ ?? d, p = {
			...p,
			[a]: {
				...p[a],
				...v
			}
		}, y && m <= 50 && (m++, typeof y == "object" && (y.placement && (f = y.placement), y.rects && (l = y.rects === !0 ? await o.getElementRects({
			reference: e,
			floating: t,
			strategy: i
		}) : y.rects), {x: u, y: d} = lp(l, f, c)), n = -1);
	}
	return {
		x: u,
		y: d,
		placement: f,
		strategy: i,
		middlewareData: p
	};
};
async function dp(e, t) {
	t === void 0 && (t = {});
	let { x: n, y: r, platform: i, rects: a, elements: o, strategy: s } = e, { boundary: c = "clippingAncestors", rootBoundary: l = "viewport", elementContext: u = "floating", altBoundary: d = !1, padding: f = 0 } = Hf(t, e), p = sp(f), m = o[d ? u === "floating" ? "reference" : "floating" : u], h = cp(await i.getClippingRect({
		element: await (i.isElement == null ? void 0 : i.isElement(m)) ?? !0 ? m : m.contextElement || await (i.getDocumentElement == null ? void 0 : i.getDocumentElement(o.floating)),
		boundary: c,
		rootBoundary: l,
		strategy: s
	})), g = u === "floating" ? {
		x: n,
		y: r,
		width: a.floating.width,
		height: a.floating.height
	} : a.reference, _ = await (i.getOffsetParent == null ? void 0 : i.getOffsetParent(o.floating)), v = await (i.isElement == null ? void 0 : i.isElement(_)) && await (i.getScale == null ? void 0 : i.getScale(_)) || {
		x: 1,
		y: 1
	}, y = cp(i.convertOffsetParentRelativeRectToViewportRelativeRect ? await i.convertOffsetParentRelativeRectToViewportRelativeRect({
		elements: o,
		rect: g,
		offsetParent: _,
		strategy: s
	}) : g);
	return {
		top: (h.top - y.top + p.top) / v.y,
		bottom: (y.bottom - h.bottom + p.bottom) / v.y,
		left: (h.left - y.left + p.left) / v.x,
		right: (y.right - h.right + p.right) / v.x
	};
}
var fp = (e) => ({
	name: "arrow",
	options: e,
	async fn(t) {
		let { x: n, y: r, placement: i, rects: a, platform: o, elements: s, middlewareData: c } = t, { element: l, padding: u = 0 } = Hf(e, t) || {};
		if (l == null) return {};
		let d = sp(u), f = {
			x: n,
			y: r
		}, p = Yf(i), m = Kf(p), h = await o.getDimensions(l), g = p === "y", _ = g ? "top" : "left", v = g ? "bottom" : "right", y = g ? "clientHeight" : "clientWidth", b = a.reference[m] + a.reference[p] - f[p] - a.floating[m], x = f[p] - a.reference[p], S = await (o.getOffsetParent == null ? void 0 : o.getOffsetParent(l)), C = S ? S[y] : 0;
		C && await (o.isElement == null ? void 0 : o.isElement(S)) || (C = s.floating[y] || a.floating[m]);
		let w = b / 2 - x / 2, T = C / 2 - h[m] / 2 - 1, E = Pf(d[_], T), ee = Pf(d[v], T), D = E, te = C - h[m] - ee, O = C / 2 - h[m] / 2 + w, k = Vf(D, O, te), A = !c.arrow && Wf(i) != null && O !== k && a.reference[m] / 2 - (O < D ? E : ee) - h[m] / 2 < 0, j = A ? O < D ? O - D : O - te : 0;
		return {
			[p]: f[p] + j,
			data: {
				[p]: k,
				centerOffset: O - k - j,
				...A && { alignmentOffset: j }
			},
			reset: A
		};
	}
}), pp = function(e) {
	return e === void 0 && (e = {}), {
		name: "flip",
		options: e,
		async fn(t) {
			var n;
			let { placement: r, middlewareData: i, rects: a, initialPlacement: o, platform: s, elements: c } = t, { mainAxis: l = !0, crossAxis: u = !0, fallbackPlacements: d, fallbackStrategy: f = "bestFit", fallbackAxisSideDirection: p = "none", flipAlignment: m = !0, ...h } = Hf(e, t);
			if ((n = i.arrow) != null && n.alignmentOffset) return {};
			let g = Uf(r), _ = Jf(o), v = Uf(o) === o, y = await (s.isRTL == null ? void 0 : s.isRTL(c.floating)), b = d || (v || !m ? [ap(o)] : Zf(o)), x = p !== "none";
			!d && x && b.push(...ip(o, m, p, y));
			let S = [o, ...b], C = await dp(t, h), w = [], T = i.flip?.overflows || [];
			if (l && w.push(C[g]), u) {
				let e = Xf(r, a, y);
				w.push(C[e[0]], C[e[1]]);
			}
			if (T = [...T, {
				placement: r,
				overflows: w
			}], !w.every((e) => e <= 0)) {
				let e = (i.flip?.index || 0) + 1, t = S[e];
				if (t && (u !== "alignment" || _ === Jf(t) || T.every((e) => Jf(e.placement) !== _ || e.overflows[0] > 0))) return {
					data: {
						index: e,
						overflows: T
					},
					reset: { placement: t }
				};
				let n = T.filter((e) => e.overflows[0] <= 0).sort((e, t) => e.overflows[1] - t.overflows[1])[0]?.placement;
				if (!n) switch (f) {
					case "bestFit": {
						let e = T.filter((e) => {
							if (x) {
								let t = Jf(e.placement);
								return t === _ || t === "y";
							}
							return !0;
						}).map((e) => [e.placement, e.overflows.filter((e) => e > 0).reduce((e, t) => e + t, 0)]).sort((e, t) => e[1] - t[1])[0]?.[0];
						e && (n = e);
						break;
					}
					case "initialPlacement": n = o;
				}
				if (r !== n) return { reset: { placement: n } };
			}
			return {};
		}
	};
};
function mp(e, t) {
	return {
		top: e.top - t.height,
		right: e.right - t.width,
		bottom: e.bottom - t.height,
		left: e.left - t.width
	};
}
function hp(e) {
	return Nf.some((t) => e[t] >= 0);
}
var gp = function(e) {
	return e === void 0 && (e = {}), {
		name: "hide",
		options: e,
		async fn(t) {
			let { rects: n } = t, { strategy: r = "referenceHidden", ...i } = Hf(e, t);
			switch (r) {
				case "referenceHidden": {
					let e = mp(await dp(t, {
						...i,
						elementContext: "reference"
					}), n.reference);
					return { data: {
						referenceHiddenOffsets: e,
						referenceHidden: hp(e)
					} };
				}
				case "escaped": {
					let e = mp(await dp(t, {
						...i,
						altBoundary: !0
					}), n.floating);
					return { data: {
						escapedOffsets: e,
						escaped: hp(e)
					} };
				}
				default: return {};
			}
		}
	};
}, _p = /*#__PURE__*/ new Set(["left", "top"]);
async function vp(e, t) {
	let { placement: n, platform: r, elements: i } = e, a = await (r.isRTL == null ? void 0 : r.isRTL(i.floating)), o = Uf(n), s = Wf(n), c = Jf(n) === "y", l = _p.has(o) ? -1 : 1, u = a && c ? -1 : 1, d = Hf(t, e), { mainAxis: f, crossAxis: p, alignmentAxis: m } = typeof d == "number" ? {
		mainAxis: d,
		crossAxis: 0,
		alignmentAxis: null
	} : {
		mainAxis: d.mainAxis || 0,
		crossAxis: d.crossAxis || 0,
		alignmentAxis: d.alignmentAxis
	};
	return s && typeof m == "number" && (p = s === "end" ? m * -1 : m), c ? {
		x: p * u,
		y: f * l
	} : {
		x: f * l,
		y: p * u
	};
}
var yp = function(e) {
	return e === void 0 && (e = 0), {
		name: "offset",
		options: e,
		async fn(t) {
			var n;
			let { x: r, y: i, placement: a, middlewareData: o } = t, s = await vp(t, e);
			return a === o.offset?.placement && (n = o.arrow) != null && n.alignmentOffset ? {} : {
				x: r + s.x,
				y: i + s.y,
				data: {
					...s,
					placement: a
				}
			};
		}
	};
}, bp = function(e) {
	return e === void 0 && (e = {}), {
		name: "shift",
		options: e,
		async fn(t) {
			let { x: n, y: r, placement: i } = t, { mainAxis: a = !0, crossAxis: o = !1, limiter: s = { fn: (e) => {
				let { x: t, y: n } = e;
				return {
					x: t,
					y: n
				};
			} }, ...c } = Hf(e, t), l = {
				x: n,
				y: r
			}, u = await dp(t, c), d = Jf(Uf(i)), f = Gf(d), p = l[f], m = l[d];
			if (a) {
				let e = f === "y" ? "top" : "left", t = f === "y" ? "bottom" : "right", n = p + u[e], r = p - u[t];
				p = Vf(n, p, r);
			}
			if (o) {
				let e = d === "y" ? "top" : "left", t = d === "y" ? "bottom" : "right", n = m + u[e], r = m - u[t];
				m = Vf(n, m, r);
			}
			let h = s.fn({
				...t,
				[f]: p,
				[d]: m
			});
			return {
				...h,
				data: {
					x: h.x - n,
					y: h.y - r,
					enabled: {
						[f]: a,
						[d]: o
					}
				}
			};
		}
	};
}, xp = function(e) {
	return e === void 0 && (e = {}), {
		options: e,
		fn(t) {
			let { x: n, y: r, placement: i, rects: a, middlewareData: o } = t, { offset: s = 0, mainAxis: c = !0, crossAxis: l = !0 } = Hf(e, t), u = {
				x: n,
				y: r
			}, d = Jf(i), f = Gf(d), p = u[f], m = u[d], h = Hf(s, t), g = typeof h == "number" ? {
				mainAxis: h,
				crossAxis: 0
			} : {
				mainAxis: 0,
				crossAxis: 0,
				...h
			};
			if (c) {
				let e = f === "y" ? "height" : "width", t = a.reference[f] - a.floating[e] + g.mainAxis, n = a.reference[f] + a.reference[e] - g.mainAxis;
				p < t ? p = t : p > n && (p = n);
			}
			if (l) {
				let e = f === "y" ? "width" : "height", t = _p.has(Uf(i)), n = a.reference[d] - a.floating[e] + (t && o.offset?.[d] || 0) + (t ? 0 : g.crossAxis), r = a.reference[d] + a.reference[e] + (t ? 0 : o.offset?.[d] || 0) - (t ? g.crossAxis : 0);
				m < n ? m = n : m > r && (m = r);
			}
			return {
				[f]: p,
				[d]: m
			};
		}
	};
}, Sp = function(e) {
	return e === void 0 && (e = {}), {
		name: "size",
		options: e,
		async fn(t) {
			var n, r;
			let { placement: i, rects: a, platform: o, elements: s } = t, { apply: c = () => {}, ...l } = Hf(e, t), u = await dp(t, l), d = Uf(i), f = Wf(i), p = Jf(i) === "y", { width: m, height: h } = a.floating, g, _;
			d === "top" || d === "bottom" ? (g = d, _ = f === (await (o.isRTL == null ? void 0 : o.isRTL(s.floating)) ? "start" : "end") ? "left" : "right") : (_ = d, g = f === "end" ? "top" : "bottom");
			let v = h - u.top - u.bottom, y = m - u.left - u.right, b = Pf(h - u[g], v), x = Pf(m - u[_], y), S = !t.middlewareData.shift, C = b, w = x;
			if ((n = t.middlewareData.shift) != null && n.enabled.x && (w = y), (r = t.middlewareData.shift) != null && r.enabled.y && (C = v), S && !f) {
				let e = Ff(u.left, 0), t = Ff(u.right, 0), n = Ff(u.top, 0), r = Ff(u.bottom, 0);
				p ? w = m - 2 * (e !== 0 || t !== 0 ? e + t : Ff(u.left, u.right)) : C = h - 2 * (n !== 0 || r !== 0 ? n + r : Ff(u.top, u.bottom));
			}
			await c({
				...t,
				availableWidth: w,
				availableHeight: C
			});
			let T = await o.getDimensions(s.floating);
			return m !== T.width || h !== T.height ? { reset: { rects: !0 } } : {};
		}
	};
};
// ../build-deps/node_modules/@floating-ui/utils/dist/floating-ui.utils.dom.mjs
function Cp() {
	return typeof window < "u";
}
function wp(e) {
	return Dp(e) ? (e.nodeName || "").toLowerCase() : "#document";
}
function Tp(e) {
	var t;
	return (e == null || (t = e.ownerDocument) == null ? void 0 : t.defaultView) || window;
}
function Ep(e) {
	return ((Dp(e) ? e.ownerDocument : e.document) || window.document)?.documentElement;
}
function Dp(e) {
	return Cp() ? e instanceof Node || e instanceof Tp(e).Node : !1;
}
function Op(e) {
	return Cp() ? e instanceof Element || e instanceof Tp(e).Element : !1;
}
function kp(e) {
	return Cp() ? e instanceof HTMLElement || e instanceof Tp(e).HTMLElement : !1;
}
function Ap(e) {
	return !Cp() || typeof ShadowRoot > "u" ? !1 : e instanceof ShadowRoot || e instanceof Tp(e).ShadowRoot;
}
var jp = /*#__PURE__*/ new Set(["inline", "contents"]);
function Mp(e) {
	let { overflow: t, overflowX: n, overflowY: r, display: i } = Gp(e);
	return /auto|scroll|overlay|hidden|clip/.test(t + r + n) && !jp.has(i);
}
var Np = /*#__PURE__*/ new Set([
	"table",
	"td",
	"th"
]);
function Pp(e) {
	return Np.has(wp(e));
}
var Fp = [":popover-open", ":modal"];
function Ip(e) {
	return Fp.some((t) => {
		try {
			return e.matches(t);
		} catch {
			return !1;
		}
	});
}
var Lp = [
	"transform",
	"translate",
	"scale",
	"rotate",
	"perspective"
], Rp = [
	"transform",
	"translate",
	"scale",
	"rotate",
	"perspective",
	"filter"
], zp = [
	"paint",
	"layout",
	"strict",
	"content"
];
function Bp(e) {
	let t = Hp(), n = Op(e) ? Gp(e) : e;
	return Lp.some((e) => n[e] ? n[e] !== "none" : !1) || (n.containerType ? n.containerType !== "normal" : !1) || !t && (n.backdropFilter ? n.backdropFilter !== "none" : !1) || !t && (n.filter ? n.filter !== "none" : !1) || Rp.some((e) => (n.willChange || "").includes(e)) || zp.some((e) => (n.contain || "").includes(e));
}
function Vp(e) {
	let t = qp(e);
	for (; kp(t) && !Wp(t);) {
		if (Bp(t)) return t;
		if (Ip(t)) return null;
		t = qp(t);
	}
	return null;
}
function Hp() {
	return typeof CSS > "u" || !CSS.supports ? !1 : CSS.supports("-webkit-backdrop-filter", "none");
}
var Up = /*#__PURE__*/ new Set([
	"html",
	"body",
	"#document"
]);
function Wp(e) {
	return Up.has(wp(e));
}
function Gp(e) {
	return Tp(e).getComputedStyle(e);
}
function Kp(e) {
	return Op(e) ? {
		scrollLeft: e.scrollLeft,
		scrollTop: e.scrollTop
	} : {
		scrollLeft: e.scrollX,
		scrollTop: e.scrollY
	};
}
function qp(e) {
	if (wp(e) === "html") return e;
	let t = e.assignedSlot || e.parentNode || Ap(e) && e.host || Ep(e);
	return Ap(t) ? t.host : t;
}
function Jp(e) {
	let t = qp(e);
	return Wp(t) ? e.ownerDocument ? e.ownerDocument.body : e.body : kp(t) && Mp(t) ? t : Jp(t);
}
function Yp(e, t, n) {
	t === void 0 && (t = []), n === void 0 && (n = !0);
	let r = Jp(e), i = r === e.ownerDocument?.body, a = Tp(r);
	if (i) {
		let e = Xp(a);
		return t.concat(a, a.visualViewport || [], Mp(r) ? r : [], e && n ? Yp(e) : []);
	}
	return t.concat(r, Yp(r, [], n));
}
function Xp(e) {
	return e.parent && Object.getPrototypeOf(e.parent) ? e.frameElement : null;
}
// ../build-deps/node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs
function Zp(e) {
	let t = Gp(e), n = parseFloat(t.width) || 0, r = parseFloat(t.height) || 0, i = kp(e), a = i ? e.offsetWidth : n, o = i ? e.offsetHeight : r, s = If(n) !== a || If(r) !== o;
	return s && (n = a, r = o), {
		width: n,
		height: r,
		$: s
	};
}
function Qp(e) {
	return Op(e) ? e : e.contextElement;
}
function $p(e) {
	let t = Qp(e);
	if (!kp(t)) return Rf(1);
	let n = t.getBoundingClientRect(), { width: r, height: i, $: a } = Zp(t), o = (a ? If(n.width) : n.width) / r, s = (a ? If(n.height) : n.height) / i;
	return o && Number.isFinite(o) || (o = 1), s && Number.isFinite(s) || (s = 1), {
		x: o,
		y: s
	};
}
var em = /*#__PURE__*/ Rf(0);
function tm(e) {
	let t = Tp(e);
	return !Hp() || !t.visualViewport ? em : {
		x: t.visualViewport.offsetLeft,
		y: t.visualViewport.offsetTop
	};
}
function nm(e, t, n) {
	return t === void 0 && (t = !1), !n || t && n !== Tp(e) ? !1 : t;
}
function rm(e, t, n, r) {
	t === void 0 && (t = !1), n === void 0 && (n = !1);
	let i = e.getBoundingClientRect(), a = Qp(e), o = Rf(1);
	t && (r ? Op(r) && (o = $p(r)) : o = $p(e));
	let s = nm(a, n, r) ? tm(a) : Rf(0), c = (i.left + s.x) / o.x, l = (i.top + s.y) / o.y, u = i.width / o.x, d = i.height / o.y;
	if (a) {
		let e = Tp(a), t = r && Op(r) ? Tp(r) : r, n = e, i = Xp(n);
		for (; i && r && t !== n;) {
			let e = $p(i), t = i.getBoundingClientRect(), r = Gp(i), a = t.left + (i.clientLeft + parseFloat(r.paddingLeft)) * e.x, o = t.top + (i.clientTop + parseFloat(r.paddingTop)) * e.y;
			c *= e.x, l *= e.y, u *= e.x, d *= e.y, c += a, l += o, n = Tp(i), i = Xp(n);
		}
	}
	return cp({
		width: u,
		height: d,
		x: c,
		y: l
	});
}
function im(e, t) {
	let n = Kp(e).scrollLeft;
	return t ? t.left + n : rm(Ep(e)).left + n;
}
function am(e, t) {
	let n = e.getBoundingClientRect();
	return {
		x: n.left + t.scrollLeft - im(e, n),
		y: n.top + t.scrollTop
	};
}
function om(e) {
	let { elements: t, rect: n, offsetParent: r, strategy: i } = e, a = i === "fixed", o = Ep(r), s = t ? Ip(t.floating) : !1;
	if (r === o || s && a) return n;
	let c = {
		scrollLeft: 0,
		scrollTop: 0
	}, l = Rf(1), u = Rf(0), d = kp(r);
	if ((d || !d && !a) && ((wp(r) !== "body" || Mp(o)) && (c = Kp(r)), kp(r))) {
		let e = rm(r);
		l = $p(r), u.x = e.x + r.clientLeft, u.y = e.y + r.clientTop;
	}
	let f = o && !d && !a ? am(o, c) : Rf(0);
	return {
		width: n.width * l.x,
		height: n.height * l.y,
		x: n.x * l.x - c.scrollLeft * l.x + u.x + f.x,
		y: n.y * l.y - c.scrollTop * l.y + u.y + f.y
	};
}
function sm(e) {
	return Array.from(e.getClientRects());
}
function cm(e) {
	let t = Ep(e), n = Kp(e), r = e.ownerDocument.body, i = Ff(t.scrollWidth, t.clientWidth, r.scrollWidth, r.clientWidth), a = Ff(t.scrollHeight, t.clientHeight, r.scrollHeight, r.clientHeight), o = -n.scrollLeft + im(e), s = -n.scrollTop;
	return Gp(r).direction === "rtl" && (o += Ff(t.clientWidth, r.clientWidth) - i), {
		width: i,
		height: a,
		x: o,
		y: s
	};
}
var lm = 25;
function um(e, t) {
	let n = Tp(e), r = Ep(e), i = n.visualViewport, a = r.clientWidth, o = r.clientHeight, s = 0, c = 0;
	if (i) {
		a = i.width, o = i.height;
		let e = Hp();
		(!e || e && t === "fixed") && (s = i.offsetLeft, c = i.offsetTop);
	}
	let l = im(r);
	if (l <= 0) {
		let e = r.ownerDocument, t = e.body, n = getComputedStyle(t), i = e.compatMode === "CSS1Compat" && parseFloat(n.marginLeft) + parseFloat(n.marginRight) || 0, o = Math.abs(r.clientWidth - t.clientWidth - i);
		o <= lm && (a -= o);
	} else l <= lm && (a += l);
	return {
		width: a,
		height: o,
		x: s,
		y: c
	};
}
var dm = /*#__PURE__*/ new Set(["absolute", "fixed"]);
function fm(e, t) {
	let n = rm(e, !0, t === "fixed"), r = n.top + e.clientTop, i = n.left + e.clientLeft, a = kp(e) ? $p(e) : Rf(1);
	return {
		width: e.clientWidth * a.x,
		height: e.clientHeight * a.y,
		x: i * a.x,
		y: r * a.y
	};
}
function pm(e, t, n) {
	let r;
	if (t === "viewport") r = um(e, n);
	else if (t === "document") r = cm(Ep(e));
	else if (Op(t)) r = fm(t, n);
	else {
		let n = tm(e);
		r = {
			x: t.x - n.x,
			y: t.y - n.y,
			width: t.width,
			height: t.height
		};
	}
	return cp(r);
}
function mm(e, t) {
	let n = qp(e);
	return n === t || !Op(n) || Wp(n) ? !1 : Gp(n).position === "fixed" || mm(n, t);
}
function hm(e, t) {
	let n = t.get(e);
	if (n) return n;
	let r = Yp(e, [], !1).filter((e) => Op(e) && wp(e) !== "body"), i = null, a = Gp(e).position === "fixed", o = a ? qp(e) : e;
	for (; Op(o) && !Wp(o);) {
		let t = Gp(o), n = Bp(o);
		!n && t.position === "fixed" && (i = null), (a ? !n && !i : !n && t.position === "static" && i && dm.has(i.position) || Mp(o) && !n && mm(e, o)) ? r = r.filter((e) => e !== o) : i = t, o = qp(o);
	}
	return t.set(e, r), r;
}
function gm(e) {
	let { element: t, boundary: n, rootBoundary: r, strategy: i } = e, a = [...n === "clippingAncestors" ? Ip(t) ? [] : hm(t, this._c) : [].concat(n), r], o = a[0], s = a.reduce((e, n) => {
		let r = pm(t, n, i);
		return e.top = Ff(r.top, e.top), e.right = Pf(r.right, e.right), e.bottom = Pf(r.bottom, e.bottom), e.left = Ff(r.left, e.left), e;
	}, pm(t, o, i));
	return {
		width: s.right - s.left,
		height: s.bottom - s.top,
		x: s.left,
		y: s.top
	};
}
function _m(e) {
	let { width: t, height: n } = Zp(e);
	return {
		width: t,
		height: n
	};
}
function vm(e, t, n) {
	let r = kp(t), i = Ep(t), a = n === "fixed", o = rm(e, !0, a, t), s = {
		scrollLeft: 0,
		scrollTop: 0
	}, c = Rf(0);
	function l() {
		c.x = im(i);
	}
	if (r || !r && !a) {
		if ((wp(t) !== "body" || Mp(i)) && (s = Kp(t)), r) {
			let e = rm(t, !0, a, t);
			c.x = e.x + t.clientLeft, c.y = e.y + t.clientTop;
		} else i && l();
	}
	a && !r && i && l();
	let u = i && !r && !a ? am(i, s) : Rf(0);
	return {
		x: o.left + s.scrollLeft - c.x - u.x,
		y: o.top + s.scrollTop - c.y - u.y,
		width: o.width,
		height: o.height
	};
}
function ym(e) {
	return Gp(e).position === "static";
}
function bm(e, t) {
	if (!kp(e) || Gp(e).position === "fixed") return null;
	if (t) return t(e);
	let n = e.offsetParent;
	return Ep(e) === n && (n = n.ownerDocument.body), n;
}
function xm(e, t) {
	let n = Tp(e);
	if (Ip(e)) return n;
	if (!kp(e)) {
		let t = qp(e);
		for (; t && !Wp(t);) {
			if (Op(t) && !ym(t)) return t;
			t = qp(t);
		}
		return n;
	}
	let r = bm(e, t);
	for (; r && Pp(r) && ym(r);) r = bm(r, t);
	return r && Wp(r) && ym(r) && !Bp(r) ? n : r || Vp(e) || n;
}
var Sm = async function(e) {
	let t = this.getOffsetParent || xm, n = this.getDimensions, r = await n(e.floating);
	return {
		reference: vm(e.reference, await t(e.floating), e.strategy),
		floating: {
			x: 0,
			y: 0,
			width: r.width,
			height: r.height
		}
	};
};
function Cm(e) {
	return Gp(e).direction === "rtl";
}
var wm = {
	convertOffsetParentRelativeRectToViewportRelativeRect: om,
	getDocumentElement: Ep,
	getClippingRect: gm,
	getOffsetParent: xm,
	getElementRects: Sm,
	getClientRects: sm,
	getDimensions: _m,
	getScale: $p,
	isElement: Op,
	isRTL: Cm
};
function Tm(e, t) {
	return e.x === t.x && e.y === t.y && e.width === t.width && e.height === t.height;
}
function Em(e, t) {
	let n = null, r, i = Ep(e);
	function a() {
		var e;
		clearTimeout(r), (e = n) == null || e.disconnect(), n = null;
	}
	function o(s, c) {
		s === void 0 && (s = !1), c === void 0 && (c = 1), a();
		let l = e.getBoundingClientRect(), { left: u, top: d, width: f, height: p } = l;
		if (s || t(), !f || !p) return;
		let m = Lf(d), h = Lf(i.clientWidth - (u + f)), g = Lf(i.clientHeight - (d + p)), _ = Lf(u), v = {
			rootMargin: -m + "px " + -h + "px " + -g + "px " + -_ + "px",
			threshold: Ff(0, Pf(1, c)) || 1
		}, y = !0;
		function b(t) {
			let n = t[0].intersectionRatio;
			if (n !== c) {
				if (!y) return o();
				n ? o(!1, n) : r = setTimeout(() => {
					o(!1, 1e-7);
				}, 1e3);
			}
			n === 1 && !Tm(l, e.getBoundingClientRect()) && o(), y = !1;
		}
		try {
			n = new IntersectionObserver(b, {
				...v,
				root: i.ownerDocument
			});
		} catch {
			n = new IntersectionObserver(b, v);
		}
		n.observe(e);
	}
	return o(!0), a;
}
function Dm(e, t, n, r) {
	r === void 0 && (r = {});
	let { ancestorScroll: i = !0, ancestorResize: a = !0, elementResize: o = typeof ResizeObserver == "function", layoutShift: s = typeof IntersectionObserver == "function", animationFrame: c = !1 } = r, l = Qp(e), u = i || a ? [...l ? Yp(l) : [], ...Yp(t)] : [];
	u.forEach((e) => {
		i && e.addEventListener("scroll", n, { passive: !0 }), a && e.addEventListener("resize", n);
	});
	let d = l && s ? Em(l, n) : null, f = -1, p = null;
	o && (p = new ResizeObserver((e) => {
		let [r] = e;
		r && r.target === l && p && (p.unobserve(t), cancelAnimationFrame(f), f = requestAnimationFrame(() => {
			var e;
			(e = p) == null || e.observe(t);
		})), n();
	}), l && !c && p.observe(l), p.observe(t));
	let m, h = c ? rm(e) : null;
	c && g();
	function g() {
		let t = rm(e);
		h && !Tm(h, t) && n(), h = t, m = requestAnimationFrame(g);
	}
	return n(), () => {
		var e;
		u.forEach((e) => {
			i && e.removeEventListener("scroll", n), a && e.removeEventListener("resize", n);
		}), d?.(), (e = p) == null || e.disconnect(), p = null, c && cancelAnimationFrame(m);
	};
}
var Om = yp, km = bp, Am = pp, jm = Sp, Mm = gp, Nm = fp, Pm = xp, Fm = (e, t, n) => {
	let r = /* @__PURE__ */ new Map(), i = {
		platform: wm,
		...n
	}, a = {
		...i.platform,
		_c: r
	};
	return up(e, t, {
		...i,
		platform: a
	});
}, Im = typeof document < "u" ? f : function() {};
function Lm(e, t) {
	if (e === t) return !0;
	if (typeof e != typeof t) return !1;
	if (typeof e == "function" && e.toString() === t.toString()) return !0;
	let n, r, i;
	if (e && t && typeof e == "object") {
		if (Array.isArray(e)) {
			if (n = e.length, n !== t.length) return !1;
			for (r = n; r-- !== 0;) if (!Lm(e[r], t[r])) return !1;
			return !0;
		}
		if (i = Object.keys(e), n = i.length, n !== Object.keys(t).length) return !1;
		for (r = n; r-- !== 0;) if (!{}.hasOwnProperty.call(t, i[r])) return !1;
		for (r = n; r-- !== 0;) {
			let n = i[r];
			if (!(n === "_owner" && e.$$typeof) && !Lm(e[n], t[n])) return !1;
		}
		return !0;
	}
	return e !== e && t !== t;
}
function Rm(e) {
	return typeof window > "u" ? 1 : (e.ownerDocument.defaultView || window).devicePixelRatio || 1;
}
function zm(e, t) {
	let n = Rm(e);
	return Math.round(t * n) / n;
}
function Bm(t) {
	let n = e.useRef(t);
	return Im(() => {
		n.current = t;
	}), n;
}
function Vm(t) {
	t === void 0 && (t = {});
	let { placement: n = "bottom", strategy: r = "absolute", middleware: i = [], platform: a, elements: { reference: o, floating: s } = {}, transform: c = !0, whileElementsMounted: l, open: u } = t, [d, f] = e.useState({
		x: 0,
		y: 0,
		strategy: r,
		placement: n,
		middlewareData: {},
		isPositioned: !1
	}), [p, m] = e.useState(i);
	Lm(p, i) || m(i);
	let [h, g] = e.useState(null), [_, v] = e.useState(null), y = e.useCallback((e) => {
		e !== w.current && (w.current = e, g(e));
	}, []), b = e.useCallback((e) => {
		e !== T.current && (T.current = e, v(e));
	}, []), S = o || h, C = s || _, w = e.useRef(null), T = e.useRef(null), E = e.useRef(d), ee = l != null, D = Bm(l), te = Bm(a), O = Bm(u), k = e.useCallback(() => {
		if (!w.current || !T.current) return;
		let e = {
			placement: n,
			strategy: r,
			middleware: p
		};
		te.current && (e.platform = te.current), Fm(w.current, T.current, e).then((e) => {
			let t = {
				...e,
				isPositioned: O.current !== !1
			};
			A.current && !Lm(E.current, t) && (E.current = t, x.flushSync(() => {
				f(t);
			}));
		});
	}, [
		p,
		n,
		r,
		te,
		O
	]);
	Im(() => {
		u === !1 && E.current.isPositioned && (E.current.isPositioned = !1, f((e) => ({
			...e,
			isPositioned: !1
		})));
	}, [u]);
	let A = e.useRef(!1);
	Im(() => (A.current = !0, () => {
		A.current = !1;
	}), []), Im(() => {
		if (S && (w.current = S), C && (T.current = C), S && C) {
			if (D.current) return D.current(S, C, k);
			k();
		}
	}, [
		S,
		C,
		k,
		D,
		ee
	]);
	let j = e.useMemo(() => ({
		reference: w,
		floating: T,
		setReference: y,
		setFloating: b
	}), [y, b]), M = e.useMemo(() => ({
		reference: S,
		floating: C
	}), [S, C]), N = e.useMemo(() => {
		let e = {
			position: r,
			left: 0,
			top: 0
		};
		if (!M.floating) return e;
		let t = zm(M.floating, d.x), n = zm(M.floating, d.y);
		return c ? {
			...e,
			transform: "translate(" + t + "px, " + n + "px)",
			...Rm(M.floating) >= 1.5 && { willChange: "transform" }
		} : {
			position: r,
			left: t,
			top: n
		};
	}, [
		r,
		c,
		M.floating,
		d.x,
		d.y
	]);
	return e.useMemo(() => ({
		...d,
		update: k,
		refs: j,
		elements: M,
		floatingStyles: N
	}), [
		d,
		k,
		j,
		M,
		N
	]);
}
var Hm = (e) => {
	function t(e) {
		return {}.hasOwnProperty.call(e, "current");
	}
	return {
		name: "arrow",
		options: e,
		fn(n) {
			let { element: r, padding: i } = typeof e == "function" ? e(n) : e;
			return r && t(r) ? r.current == null ? {} : Nm({
				element: r.current,
				padding: i
			}).fn(n) : r ? Nm({
				element: r,
				padding: i
			}).fn(n) : {};
		}
	};
}, Um = (e, t) => ({
	...Om(e),
	options: [e, t]
}), Wm = (e, t) => ({
	...km(e),
	options: [e, t]
}), Gm = (e, t) => ({
	...Pm(e),
	options: [e, t]
}), Km = (e, t) => ({
	...Am(e),
	options: [e, t]
}), qm = (e, t) => ({
	...jm(e),
	options: [e, t]
}), Jm = (e, t) => ({
	...Mm(e),
	options: [e, t]
}), Ym = (e, t) => ({
	...Hm(e),
	options: [e, t]
}), Xm = "Arrow", Zm = e.forwardRef((e, t) => {
	let { children: n, width: r = 10, height: i = 5, ...a } = e;
	return /* @__PURE__ */ v(Ud.svg, {
		...a,
		ref: t,
		width: r,
		height: i,
		viewBox: "0 0 30 10",
		preserveAspectRatio: "none",
		children: e.asChild ? n : /* @__PURE__ */ v("polygon", { points: "0,0 30,0 15,10" })
	});
});
Zm.displayName = Xm;
var Qm = Zm;
// ../build-deps/node_modules/@radix-ui/react-use-size/dist/index.mjs
function $m(t) {
	let [n, r] = e.useState(void 0);
	return kf(() => {
		if (t) {
			r({
				width: t.offsetWidth,
				height: t.offsetHeight
			});
			let e = new ResizeObserver((e) => {
				if (!Array.isArray(e) || !e.length) return;
				let n = e[0], i, a;
				if ("borderBoxSize" in n) {
					let e = n.borderBoxSize, t = Array.isArray(e) ? e[0] : e;
					i = t.inlineSize, a = t.blockSize;
				} else i = t.offsetWidth, a = t.offsetHeight;
				r({
					width: i,
					height: a
				});
			});
			return e.observe(t, { box: "border-box" }), () => e.unobserve(t);
		}
		r(void 0);
	}, [t]), n;
}
// ../build-deps/node_modules/@radix-ui/react-popper/dist/index.mjs
var eh = "Popper", [th, nh] = Md(eh), [rh, ih] = th(eh), ah = (t) => {
	let { __scopePopper: n, children: r } = t, [i, a] = e.useState(null);
	return /* @__PURE__ */ v(rh, {
		scope: n,
		anchor: i,
		onAnchorChange: a,
		children: r
	});
};
ah.displayName = eh;
var oh = "PopperAnchor", sh = e.forwardRef((t, n) => {
	let { __scopePopper: r, virtualRef: i, ...a } = t, o = ih(oh, r), s = e.useRef(null), c = Id(n, s), l = e.useRef(null);
	return e.useEffect(() => {
		let e = l.current;
		l.current = i?.current || s.current, e !== l.current && o.onAnchorChange(l.current);
	}), i ? null : /* @__PURE__ */ v(Ud.div, {
		...a,
		ref: c
	});
});
sh.displayName = oh;
var ch = "PopperContent", [lh, uh] = th(ch), dh = e.forwardRef((t, n) => {
	let { __scopePopper: r, side: i = "bottom", sideOffset: a = 0, align: o = "center", alignOffset: s = 0, arrowPadding: c = 0, avoidCollisions: l = !0, collisionBoundary: u = [], collisionPadding: d = 0, sticky: f = "partial", hideWhenDetached: p = !1, updatePositionStrategy: m = "optimized", onPlaced: h, ...g } = t, _ = ih(ch, r), [y, b] = e.useState(null), x = Id(n, (e) => b(e)), [S, C] = e.useState(null), w = $m(S), T = w?.width ?? 0, E = w?.height ?? 0, ee = i + (o === "center" ? "" : "-" + o), D = typeof d == "number" ? d : {
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
		...d
	}, te = Array.isArray(u) ? u : [u], O = te.length > 0, k = {
		padding: D,
		boundary: te.filter(hh),
		altBoundary: O
	}, { refs: A, floatingStyles: j, placement: M, isPositioned: N, middlewareData: P } = Vm({
		strategy: "fixed",
		placement: ee,
		whileElementsMounted: (...e) => Dm(...e, { animationFrame: m === "always" }),
		elements: { reference: _.anchor },
		middleware: [
			Um({
				mainAxis: a + E,
				alignmentAxis: s
			}),
			l && Wm({
				mainAxis: !0,
				crossAxis: !1,
				limiter: f === "partial" ? Gm() : void 0,
				...k
			}),
			l && Km({ ...k }),
			qm({
				...k,
				apply: ({ elements: e, rects: t, availableWidth: n, availableHeight: r }) => {
					let { width: i, height: a } = t.reference, o = e.floating.style;
					o.setProperty("--radix-popper-available-width", `${n}px`), o.setProperty("--radix-popper-available-height", `${r}px`), o.setProperty("--radix-popper-anchor-width", `${i}px`), o.setProperty("--radix-popper-anchor-height", `${a}px`);
				}
			}),
			S && Ym({
				element: S,
				padding: c
			}),
			gh({
				arrowWidth: T,
				arrowHeight: E
			}),
			p && Jm({
				strategy: "referenceHidden",
				...k
			})
		]
	}), [ne, re] = _h(M), F = Jd(h);
	kf(() => {
		N && F?.();
	}, [N, F]);
	let I = P.arrow?.x, L = P.arrow?.y, ie = P.arrow?.centerOffset !== 0, [R, z] = e.useState();
	return kf(() => {
		y && z(window.getComputedStyle(y).zIndex);
	}, [y]), /* @__PURE__ */ v("div", {
		ref: A.setFloating,
		"data-radix-popper-content-wrapper": "",
		style: {
			...j,
			transform: N ? j.transform : "translate(0, -200%)",
			minWidth: "max-content",
			zIndex: R,
			"--radix-popper-transform-origin": [P.transformOrigin?.x, P.transformOrigin?.y].join(" "),
			...P.hide?.referenceHidden && {
				visibility: "hidden",
				pointerEvents: "none"
			}
		},
		dir: t.dir,
		children: /* @__PURE__ */ v(lh, {
			scope: r,
			placedSide: ne,
			onArrowChange: C,
			arrowX: I,
			arrowY: L,
			shouldHideArrow: ie,
			children: /* @__PURE__ */ v(Ud.div, {
				"data-side": ne,
				"data-align": re,
				...g,
				ref: x,
				style: {
					...g.style,
					animation: N ? void 0 : "none"
				}
			})
		})
	});
});
dh.displayName = ch;
var fh = "PopperArrow", ph = {
	top: "bottom",
	right: "left",
	bottom: "top",
	left: "right"
}, mh = e.forwardRef(function(e, t) {
	let { __scopePopper: n, ...r } = e, i = uh(fh, n), a = ph[i.placedSide];
	return /* @__PURE__ */ v("span", {
		ref: i.onArrowChange,
		style: {
			position: "absolute",
			left: i.arrowX,
			top: i.arrowY,
			[a]: 0,
			transformOrigin: {
				top: "",
				right: "0 0",
				bottom: "center 0",
				left: "100% 0"
			}[i.placedSide],
			transform: {
				top: "translateY(100%)",
				right: "translateY(50%) rotate(90deg) translateX(-50%)",
				bottom: "rotate(180deg)",
				left: "translateY(50%) rotate(-90deg) translateX(50%)"
			}[i.placedSide],
			visibility: i.shouldHideArrow ? "hidden" : void 0
		},
		children: /* @__PURE__ */ v(Qm, {
			...r,
			ref: t,
			style: {
				...r.style,
				display: "block"
			}
		})
	});
});
mh.displayName = fh;
function hh(e) {
	return e !== null;
}
var gh = (e) => ({
	name: "transformOrigin",
	options: e,
	fn(t) {
		let { placement: n, rects: r, middlewareData: i } = t, a = i.arrow?.centerOffset !== 0, o = a ? 0 : e.arrowWidth, s = a ? 0 : e.arrowHeight, [c, l] = _h(n), u = {
			start: "0%",
			center: "50%",
			end: "100%"
		}[l], d = (i.arrow?.x ?? 0) + o / 2, f = (i.arrow?.y ?? 0) + s / 2, p = "", m = "";
		return c === "bottom" ? (p = a ? u : `${d}px`, m = `${-s}px`) : c === "top" ? (p = a ? u : `${d}px`, m = `${r.floating.height + s}px`) : c === "right" ? (p = `${-s}px`, m = a ? u : `${f}px`) : c === "left" && (p = `${r.floating.width + s}px`, m = a ? u : `${f}px`), { data: {
			x: p,
			y: m
		} };
	}
});
function _h(e) {
	let [t, n = "center"] = e.split("-");
	return [t, n];
}
var vh = ah, yh = sh, bh = dh, xh = mh, Sh = "Portal", Ch = e.forwardRef((t, n) => {
	let { container: r, ...i } = t, [a, o] = e.useState(!1);
	kf(() => o(!0), []);
	let s = r || a && globalThis?.document?.body;
	return s ? b.createPortal(/* @__PURE__ */ v(Ud.div, {
		...i,
		ref: n
	}), s) : null;
});
Ch.displayName = Sh;
// ../build-deps/node_modules/@radix-ui/react-presence/dist/index.mjs
function wh(t, n) {
	return e.useReducer((e, t) => n[e][t] ?? e, t);
}
var Th = (t) => {
	let { present: n, children: r } = t, i = Eh(n), a = typeof r == "function" ? r({ present: i.isPresent }) : e.Children.only(r), o = Id(i.ref, Oh(a));
	return typeof r == "function" || i.isPresent ? e.cloneElement(a, { ref: o }) : null;
};
Th.displayName = "Presence";
function Eh(t) {
	let [n, r] = e.useState(), i = e.useRef(null), a = e.useRef(t), o = e.useRef("none"), [s, c] = wh(t ? "mounted" : "unmounted", {
		mounted: {
			UNMOUNT: "unmounted",
			ANIMATION_OUT: "unmountSuspended"
		},
		unmountSuspended: {
			MOUNT: "mounted",
			ANIMATION_END: "unmounted"
		},
		unmounted: { MOUNT: "mounted" }
	});
	return e.useEffect(() => {
		let e = Dh(i.current);
		o.current = s === "mounted" ? e : "none";
	}, [s]), kf(() => {
		let e = i.current, n = a.current;
		if (n !== t) {
			let r = o.current, i = Dh(e);
			t ? c("MOUNT") : i === "none" || e?.display === "none" ? c("UNMOUNT") : c(n && r !== i ? "ANIMATION_OUT" : "UNMOUNT"), a.current = t;
		}
	}, [t, c]), kf(() => {
		if (n) {
			let e, t = n.ownerDocument.defaultView ?? window, r = (r) => {
				let o = Dh(i.current).includes(CSS.escape(r.animationName));
				if (r.target === n && o && (c("ANIMATION_END"), !a.current)) {
					let r = n.style.animationFillMode;
					n.style.animationFillMode = "forwards", e = t.setTimeout(() => {
						n.style.animationFillMode === "forwards" && (n.style.animationFillMode = r);
					});
				}
			}, s = (e) => {
				e.target === n && (o.current = Dh(i.current));
			};
			return n.addEventListener("animationstart", s), n.addEventListener("animationcancel", r), n.addEventListener("animationend", r), () => {
				t.clearTimeout(e), n.removeEventListener("animationstart", s), n.removeEventListener("animationcancel", r), n.removeEventListener("animationend", r);
			};
		}
		c("ANIMATION_END");
	}, [n, c]), {
		isPresent: ["mounted", "unmountSuspended"].includes(s),
		ref: e.useCallback((e) => {
			i.current = e ? getComputedStyle(e) : null, r(e);
		}, [])
	};
}
function Dh(e) {
	return e?.animationName || "none";
}
function Oh(e) {
	let t = Object.getOwnPropertyDescriptor(e.props, "ref")?.get, n = t && "isReactWarning" in t && t.isReactWarning;
	return n ? e.ref : (t = Object.getOwnPropertyDescriptor(e, "ref")?.get, n = t && "isReactWarning" in t && t.isReactWarning, n ? e.props.ref : e.props.ref || e.ref);
}
// ../build-deps/node_modules/@radix-ui/react-use-controllable-state/dist/index.mjs
var kh = e.useInsertionEffect || kf;
function Ah({ prop: t, defaultProp: n, onChange: r = () => {}, caller: i }) {
	let [a, o, s] = jh({
		defaultProp: n,
		onChange: r
	}), c = t !== void 0, l = c ? t : a;
	{
		let n = e.useRef(t !== void 0);
		e.useEffect(() => {
			let e = n.current;
			e !== c && console.warn(`${i} is changing from ${e ? "controlled" : "uncontrolled"} to ${c ? "controlled" : "uncontrolled"}. Components should not switch from controlled to uncontrolled (or vice versa). Decide between using a controlled or uncontrolled value for the lifetime of the component.`), n.current = c;
		}, [c, i]);
	}
	return [l, e.useCallback((e) => {
		if (c) {
			let n = Mh(e) ? e(t) : e;
			n !== t && s.current?.(n);
		} else o(e);
	}, [
		c,
		t,
		o,
		s
	])];
}
function jh({ defaultProp: t, onChange: n }) {
	let [r, i] = e.useState(t), a = e.useRef(r), o = e.useRef(n);
	return kh(() => {
		o.current = n;
	}, [n]), e.useEffect(() => {
		a.current !== r && (o.current?.(r), a.current = r);
	}, [r, a]), [
		r,
		i,
		o
	];
}
function Mh(e) {
	return typeof e == "function";
}
// ../build-deps/node_modules/@radix-ui/react-roving-focus/dist/index.mjs
var Nh = "rovingFocusGroup.onEntryFocus", Ph = {
	bubbles: !1,
	cancelable: !0
}, Fh = "RovingFocusGroup", [Ih, Lh, Rh] = Gd(Fh), [zh, Bh] = Md(Fh, [Rh]), [Vh, Hh] = zh(Fh), Uh = e.forwardRef((e, t) => /* @__PURE__ */ v(Ih.Provider, {
	scope: e.__scopeRovingFocusGroup,
	children: /* @__PURE__ */ v(Ih.Slot, {
		scope: e.__scopeRovingFocusGroup,
		children: /* @__PURE__ */ v(Wh, {
			...e,
			ref: t
		})
	})
}));
Uh.displayName = Fh;
var Wh = e.forwardRef((t, n) => {
	let { __scopeRovingFocusGroup: r, orientation: i, loop: a = !1, dir: o, currentTabStopId: s, defaultCurrentTabStopId: c, onCurrentTabStopIdChange: l, onEntryFocus: u, preventScrollOnEntryFocus: d = !1, ...f } = t, p = e.useRef(null), m = Id(n, p), h = qd(o), [g, _] = Ah({
		prop: s,
		defaultProp: c ?? null,
		onChange: l,
		caller: Fh
	}), [y, b] = e.useState(!1), x = Jd(u), S = Lh(r), C = e.useRef(!1), [w, T] = e.useState(0);
	return e.useEffect(() => {
		let e = p.current;
		if (e) return e.addEventListener(Nh, x), () => e.removeEventListener(Nh, x);
	}, [x]), /* @__PURE__ */ v(Vh, {
		scope: r,
		orientation: i,
		dir: h,
		loop: a,
		currentTabStopId: g,
		onItemFocus: e.useCallback((e) => _(e), [_]),
		onItemShiftTab: e.useCallback(() => b(!0), []),
		onFocusableItemAdd: e.useCallback(() => T((e) => e + 1), []),
		onFocusableItemRemove: e.useCallback(() => T((e) => e - 1), []),
		children: /* @__PURE__ */ v(Ud.div, {
			tabIndex: y || w === 0 ? -1 : 0,
			"data-orientation": i,
			...f,
			ref: m,
			style: {
				outline: "none",
				...t.style
			},
			onMouseDown: $(t.onMouseDown, () => {
				C.current = !0;
			}),
			onFocus: $(t.onFocus, (e) => {
				let t = !C.current;
				if (e.target === e.currentTarget && t && !y) {
					let t = new CustomEvent(Nh, Ph);
					if (e.currentTarget.dispatchEvent(t), !t.defaultPrevented) {
						let e = S().filter((e) => e.focusable);
						Xh([
							e.find((e) => e.active),
							e.find((e) => e.id === g),
							...e
						].filter(Boolean).map((e) => e.ref.current), d);
					}
				}
				C.current = !1;
			}),
			onBlur: $(t.onBlur, () => b(!1))
		})
	});
}), Gh = "RovingFocusGroupItem", Kh = e.forwardRef((t, n) => {
	let { __scopeRovingFocusGroup: r, focusable: i = !0, active: a = !1, tabStopId: o, children: s, ...c } = t, l = Mf(), u = o || l, d = Hh(Gh, r), f = d.currentTabStopId === u, p = Lh(r), { onFocusableItemAdd: m, onFocusableItemRemove: h, currentTabStopId: g } = d;
	return e.useEffect(() => {
		if (i) return m(), () => h();
	}, [
		i,
		m,
		h
	]), /* @__PURE__ */ v(Ih.ItemSlot, {
		scope: r,
		id: u,
		focusable: i,
		active: a,
		children: /* @__PURE__ */ v(Ud.span, {
			tabIndex: f ? 0 : -1,
			"data-orientation": d.orientation,
			...c,
			ref: n,
			onMouseDown: $(t.onMouseDown, (e) => {
				i ? d.onItemFocus(u) : e.preventDefault();
			}),
			onFocus: $(t.onFocus, () => d.onItemFocus(u)),
			onKeyDown: $(t.onKeyDown, (e) => {
				if (e.key === "Tab" && e.shiftKey) {
					d.onItemShiftTab();
					return;
				}
				if (e.target !== e.currentTarget) return;
				let t = Yh(e, d.orientation, d.dir);
				if (t !== void 0) {
					if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
					e.preventDefault();
					let n = p().filter((e) => e.focusable).map((e) => e.ref.current);
					if (t === "last") n.reverse();
					else if (t === "prev" || t === "next") {
						t === "prev" && n.reverse();
						let r = n.indexOf(e.currentTarget);
						n = d.loop ? Zh(n, r + 1) : n.slice(r + 1);
					}
					setTimeout(() => Xh(n));
				}
			}),
			children: typeof s == "function" ? s({
				isCurrentTabStop: f,
				hasTabStop: g != null
			}) : s
		})
	});
});
Kh.displayName = Gh;
var qh = {
	ArrowLeft: "prev",
	ArrowUp: "prev",
	ArrowRight: "next",
	ArrowDown: "next",
	PageUp: "first",
	Home: "first",
	PageDown: "last",
	End: "last"
};
function Jh(e, t) {
	return t === "rtl" ? e === "ArrowLeft" ? "ArrowRight" : e === "ArrowRight" ? "ArrowLeft" : e : e;
}
function Yh(e, t, n) {
	let r = Jh(e.key, n);
	if (!(t === "vertical" && ["ArrowLeft", "ArrowRight"].includes(r)) && !(t === "horizontal" && ["ArrowUp", "ArrowDown"].includes(r))) return qh[r];
}
function Xh(e, t = !1) {
	let n = document.activeElement;
	for (let r of e) if (r === n || (r.focus({ preventScroll: t }), document.activeElement !== n)) return;
}
function Zh(e, t) {
	return e.map((n, r) => e[(t + r) % e.length]);
}
var Qh = Uh, $h = Kh, eg = function(e) {
	return typeof document > "u" ? null : (Array.isArray(e) ? e[0] : e).ownerDocument.body;
}, tg = /* @__PURE__ */ new WeakMap(), ng = /* @__PURE__ */ new WeakMap(), rg = {}, ig = 0, ag = function(e) {
	return e && (e.host || ag(e.parentNode));
}, og = function(e, t) {
	return t.map(function(t) {
		if (e.contains(t)) return t;
		var n = ag(t);
		return n && e.contains(n) ? n : (console.error("aria-hidden", t, "in not contained inside", e, ". Doing nothing"), null);
	}).filter(function(e) {
		return !!e;
	});
}, sg = function(e, t, n, r) {
	var i = og(t, Array.isArray(e) ? e : [e]);
	rg[n] || (rg[n] = /* @__PURE__ */ new WeakMap());
	var a = rg[n], o = [], s = /* @__PURE__ */ new Set(), c = new Set(i), l = function(e) {
		e && !s.has(e) && (s.add(e), l(e.parentNode));
	};
	i.forEach(l);
	var u = function(e) {
		e && !c.has(e) && Array.prototype.forEach.call(e.children, function(e) {
			if (s.has(e)) u(e);
			else try {
				var t = e.getAttribute(r), i = t !== null && t !== "false", c = (tg.get(e) || 0) + 1, l = (a.get(e) || 0) + 1;
				tg.set(e, c), a.set(e, l), o.push(e), c === 1 && i && ng.set(e, !0), l === 1 && e.setAttribute(n, "true"), i || e.setAttribute(r, "true");
			} catch (t) {
				console.error("aria-hidden: cannot operate on ", e, t);
			}
		});
	};
	return u(t), s.clear(), ig++, function() {
		o.forEach(function(e) {
			var t = tg.get(e) - 1, i = a.get(e) - 1;
			tg.set(e, t), a.set(e, i), t || (ng.has(e) || e.removeAttribute(r), ng.delete(e)), i || e.removeAttribute(n);
		}), ig--, ig || (tg = /* @__PURE__ */ new WeakMap(), tg = /* @__PURE__ */ new WeakMap(), ng = /* @__PURE__ */ new WeakMap(), rg = {});
	};
}, cg = function(e, t, n) {
	n === void 0 && (n = "data-aria-hidden");
	var r = Array.from(Array.isArray(e) ? e : [e]), i = t || eg(e);
	return i ? (r.push.apply(r, Array.from(i.querySelectorAll("[aria-live], script"))), sg(r, i, n, "aria-hidden")) : function() {
		return null;
	};
}, lg = function() {
	return lg = Object.assign || function(e) {
		for (var t, n = 1, r = arguments.length; n < r; n++) for (var i in t = arguments[n], t) Object.prototype.hasOwnProperty.call(t, i) && (e[i] = t[i]);
		return e;
	}, lg.apply(this, arguments);
};
function ug(e, t) {
	var n = {};
	for (var r in e) Object.prototype.hasOwnProperty.call(e, r) && t.indexOf(r) < 0 && (n[r] = e[r]);
	if (e != null && typeof Object.getOwnPropertySymbols == "function") for (var i = 0, r = Object.getOwnPropertySymbols(e); i < r.length; i++) t.indexOf(r[i]) < 0 && Object.prototype.propertyIsEnumerable.call(e, r[i]) && (n[r[i]] = e[r[i]]);
	return n;
}
function dg(e, t, n) {
	if (n || arguments.length === 2) for (var r = 0, i = t.length, a; r < i; r++) (a || !(r in t)) && (a ||= Array.prototype.slice.call(t, 0, r), a[r] = t[r]);
	return e.concat(a || Array.prototype.slice.call(t));
}
// ../build-deps/node_modules/react-remove-scroll-bar/dist/es2015/constants.js
var fg = "right-scroll-bar-position", pg = "width-before-scroll-bar", mg = "with-scroll-bars-hidden", hg = "--removed-body-scroll-bar-size";
// ../build-deps/node_modules/use-callback-ref/dist/es2015/assignRef.js
function gg(e, t) {
	return typeof e == "function" ? e(t) : e && (e.current = t), e;
}
// ../build-deps/node_modules/use-callback-ref/dist/es2015/useRef.js
function _g(e, t) {
	var n = h(function() {
		return {
			value: e,
			callback: t,
			facade: {
				get current() {
					return n.value;
				},
				set current(e) {
					var t = n.value;
					t !== e && (n.value = e, n.callback(e, t));
				}
			}
		};
	})[0];
	return n.callback = t, n.facade;
}
// ../build-deps/node_modules/use-callback-ref/dist/es2015/useMergeRef.js
var vg = typeof window < "u" ? e.useLayoutEffect : e.useEffect, yg = /* @__PURE__ */ new WeakMap();
function bg(e, t) {
	var n = _g(t || null, function(t) {
		return e.forEach(function(e) {
			return gg(e, t);
		});
	});
	return vg(function() {
		var t = yg.get(n);
		if (t) {
			var r = new Set(t), i = new Set(e), a = n.current;
			r.forEach(function(e) {
				i.has(e) || gg(e, null);
			}), i.forEach(function(e) {
				r.has(e) || gg(e, a);
			});
		}
		yg.set(n, e);
	}, [e]), n;
}
// ../build-deps/node_modules/use-sidecar/dist/es2015/medium.js
function xg(e) {
	return e;
}
function Sg(e, t) {
	t === void 0 && (t = xg);
	var n = [], r = !1;
	return {
		read: function() {
			if (r) throw Error("Sidecar: could not `read` from an `assigned` medium. `read` could be used only with `useMedium`.");
			return n.length ? n[n.length - 1] : e;
		},
		useMedium: function(e) {
			var i = t(e, r);
			return n.push(i), function() {
				n = n.filter(function(e) {
					return e !== i;
				});
			};
		},
		assignSyncMedium: function(e) {
			for (r = !0; n.length;) {
				var t = n;
				n = [], t.forEach(e);
			}
			n = {
				push: function(t) {
					return e(t);
				},
				filter: function() {
					return n;
				}
			};
		},
		assignMedium: function(e) {
			r = !0;
			var t = [];
			if (n.length) {
				var i = n;
				n = [], i.forEach(e), t = n;
			}
			var a = function() {
				var n = t;
				t = [], n.forEach(e);
			}, o = function() {
				return Promise.resolve().then(a);
			};
			o(), n = {
				push: function(e) {
					t.push(e), o();
				},
				filter: function(e) {
					return t = t.filter(e), n;
				}
			};
		}
	};
}
function Cg(e) {
	e === void 0 && (e = {});
	var t = Sg(null);
	return t.options = lg({
		async: !0,
		ssr: !1
	}, e), t;
}
// ../build-deps/node_modules/use-sidecar/dist/es2015/exports.js
var wg = function(t) {
	var n = t.sideCar, r = ug(t, ["sideCar"]);
	if (!n) throw Error("Sidecar: please provide `sideCar` property to import the right car");
	var i = n.read();
	if (!i) throw Error("Sidecar medium not found");
	return e.createElement(i, lg({}, r));
};
wg.isSideCarExport = !0;
function Tg(e, t) {
	return e.useMedium(t), wg;
}
// ../build-deps/node_modules/react-remove-scroll/dist/es2015/medium.js
var Eg = Cg(), Dg = function() {}, Og = e.forwardRef(function(t, n) {
	var r = e.useRef(null), i = e.useState({
		onScrollCapture: Dg,
		onWheelCapture: Dg,
		onTouchMoveCapture: Dg
	}), a = i[0], o = i[1], s = t.forwardProps, c = t.children, l = t.className, u = t.removeScrollBar, d = t.enabled, f = t.shards, p = t.sideCar, m = t.noRelative, h = t.noIsolation, g = t.inert, _ = t.allowPinchZoom, v = t.as, y = v === void 0 ? "div" : v, b = t.gapMode, x = ug(t, [
		"forwardProps",
		"children",
		"className",
		"removeScrollBar",
		"enabled",
		"shards",
		"sideCar",
		"noRelative",
		"noIsolation",
		"inert",
		"allowPinchZoom",
		"as",
		"gapMode"
	]), S = p, C = bg([r, n]), w = lg(lg({}, x), a);
	return e.createElement(e.Fragment, null, d && e.createElement(S, {
		sideCar: Eg,
		removeScrollBar: u,
		shards: f,
		noRelative: m,
		noIsolation: h,
		inert: g,
		setCallbacks: o,
		allowPinchZoom: !!_,
		lockRef: r,
		gapMode: b
	}), s ? e.cloneElement(e.Children.only(c), lg(lg({}, w), { ref: C })) : e.createElement(y, lg({}, w, {
		className: l,
		ref: C
	}), c));
});
Og.defaultProps = {
	enabled: !0,
	removeScrollBar: !0,
	inert: !1
}, Og.classNames = {
	fullWidth: pg,
	zeroRight: fg
};
// ../build-deps/node_modules/get-nonce/dist/es2015/index.js
var kg = function() {
	if (typeof __webpack_nonce__ < "u") return __webpack_nonce__;
};
// ../build-deps/node_modules/react-style-singleton/dist/es2015/singleton.js
function Ag() {
	if (!document) return null;
	var e = document.createElement("style");
	e.type = "text/css";
	var t = kg();
	return t && e.setAttribute("nonce", t), e;
}
function jg(e, t) {
	e.styleSheet ? e.styleSheet.cssText = t : e.appendChild(document.createTextNode(t));
}
function Mg(e) {
	(document.head || document.getElementsByTagName("head")[0]).appendChild(e);
}
var Ng = function() {
	var e = 0, t = null;
	return {
		add: function(n) {
			e == 0 && (t = Ag()) && (jg(t, n), Mg(t)), e++;
		},
		remove: function() {
			e--, !e && t && (t.parentNode && t.parentNode.removeChild(t), t = null);
		}
	};
}, Pg = function() {
	var t = Ng();
	return function(n, r) {
		e.useEffect(function() {
			return t.add(n), function() {
				t.remove();
			};
		}, [n && r]);
	};
}, Fg = function() {
	var e = Pg();
	return function(t) {
		var n = t.styles, r = t.dynamic;
		return e(n, r), null;
	};
}, Ig = {
	left: 0,
	top: 0,
	right: 0,
	gap: 0
}, Lg = function(e) {
	return parseInt(e || "", 10) || 0;
}, Rg = function(e) {
	var t = window.getComputedStyle(document.body), n = t[e === "padding" ? "paddingLeft" : "marginLeft"], r = t[e === "padding" ? "paddingTop" : "marginTop"], i = t[e === "padding" ? "paddingRight" : "marginRight"];
	return [
		Lg(n),
		Lg(r),
		Lg(i)
	];
}, zg = function(e) {
	if (e === void 0 && (e = "margin"), typeof window > "u") return Ig;
	var t = Rg(e), n = document.documentElement.clientWidth, r = window.innerWidth;
	return {
		left: t[0],
		top: t[1],
		right: t[2],
		gap: Math.max(0, r - n + t[2] - t[0])
	};
}, Bg = Fg(), Vg = "data-scroll-locked", Hg = function(e, t, n, r) {
	var i = e.left, a = e.top, o = e.right, s = e.gap;
	return n === void 0 && (n = "margin"), `
  .${mg} {
   overflow: hidden ${r};
   padding-right: ${s}px ${r};
  }
  body[${Vg}] {
    overflow: hidden ${r};
    overscroll-behavior: contain;
    ${[
		t && `position: relative ${r};`,
		n === "margin" && `
    padding-left: ${i}px;
    padding-top: ${a}px;
    padding-right: ${o}px;
    margin-left:0;
    margin-top:0;
    margin-right: ${s}px ${r};
    `,
		n === "padding" && `padding-right: ${s}px ${r};`
	].filter(Boolean).join("")}
  }
  
  .${fg} {
    right: ${s}px ${r};
  }
  
  .${pg} {
    margin-right: ${s}px ${r};
  }
  
  .${fg} .${fg} {
    right: 0 ${r};
  }
  
  .${pg} .${pg} {
    margin-right: 0 ${r};
  }
  
  body[${Vg}] {
    ${hg}: ${s}px;
  }
`;
}, Ug = function() {
	var e = parseInt(document.body.getAttribute("data-scroll-locked") || "0", 10);
	return isFinite(e) ? e : 0;
}, Wg = function() {
	e.useEffect(function() {
		return document.body.setAttribute(Vg, (Ug() + 1).toString()), function() {
			var e = Ug() - 1;
			e <= 0 ? document.body.removeAttribute(Vg) : document.body.setAttribute(Vg, e.toString());
		};
	}, []);
}, Gg = function(t) {
	var n = t.noRelative, r = t.noImportant, i = t.gapMode, a = i === void 0 ? "margin" : i;
	Wg();
	var o = e.useMemo(function() {
		return zg(a);
	}, [a]);
	return e.createElement(Bg, { styles: Hg(o, !n, a, r ? "" : "!important") });
}, Kg = !1;
if (typeof window < "u") try {
	var qg = Object.defineProperty({}, "passive", { get: function() {
		return Kg = !0, !0;
	} });
	window.addEventListener("test", qg, qg), window.removeEventListener("test", qg, qg);
} catch {
	Kg = !1;
}
var Jg = Kg ? { passive: !1 } : !1, Yg = function(e) {
	return e.tagName === "TEXTAREA";
}, Xg = function(e, t) {
	if (!(e instanceof Element)) return !1;
	var n = window.getComputedStyle(e);
	return n[t] !== "hidden" && !(n.overflowY === n.overflowX && !Yg(e) && n[t] === "visible");
}, Zg = function(e) {
	return Xg(e, "overflowY");
}, Qg = function(e) {
	return Xg(e, "overflowX");
}, $g = function(e, t) {
	var n = t.ownerDocument, r = t;
	do {
		if (typeof ShadowRoot < "u" && r instanceof ShadowRoot && (r = r.host), n_(e, r)) {
			var i = r_(e, r);
			if (i[1] > i[2]) return !0;
		}
		r = r.parentNode;
	} while (r && r !== n.body);
	return !1;
}, e_ = function(e) {
	return [
		e.scrollTop,
		e.scrollHeight,
		e.clientHeight
	];
}, t_ = function(e) {
	return [
		e.scrollLeft,
		e.scrollWidth,
		e.clientWidth
	];
}, n_ = function(e, t) {
	return e === "v" ? Zg(t) : Qg(t);
}, r_ = function(e, t) {
	return e === "v" ? e_(t) : t_(t);
}, i_ = function(e, t) {
	return e === "h" && t === "rtl" ? -1 : 1;
}, a_ = function(e, t, n, r, i) {
	var a = i_(e, window.getComputedStyle(t).direction), o = a * r, s = n.target, c = t.contains(s), l = !1, u = o > 0, d = 0, f = 0;
	do {
		if (!s) break;
		var p = r_(e, s), m = p[0], h = p[1] - p[2] - a * m;
		(m || h) && n_(e, s) && (d += h, f += m);
		var g = s.parentNode;
		s = g && g.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? g.host : g;
	} while (!c && s !== document.body || c && (t.contains(s) || t === s));
	return (u && (i && Math.abs(d) < 1 || !i && o > d) || !u && (i && Math.abs(f) < 1 || !i && -o > f)) && (l = !0), l;
}, o_ = function(e) {
	return "changedTouches" in e ? [e.changedTouches[0].clientX, e.changedTouches[0].clientY] : [0, 0];
}, s_ = function(e) {
	return [e.deltaX, e.deltaY];
}, c_ = function(e) {
	return e && "current" in e ? e.current : e;
}, l_ = function(e, t) {
	return e[0] === t[0] && e[1] === t[1];
}, u_ = function(e) {
	return `
  .block-interactivity-${e} {pointer-events: none;}
  .allow-interactivity-${e} {pointer-events: all;}
`;
}, d_ = 0, f_ = [];
function p_(t) {
	var n = e.useRef([]), r = e.useRef([0, 0]), i = e.useRef(), a = e.useState(d_++)[0], o = e.useState(Fg)[0], s = e.useRef(t);
	e.useEffect(function() {
		s.current = t;
	}, [t]), e.useEffect(function() {
		if (t.inert) {
			document.body.classList.add(`block-interactivity-${a}`);
			var e = dg([t.lockRef.current], (t.shards || []).map(c_), !0).filter(Boolean);
			return e.forEach(function(e) {
				return e.classList.add(`allow-interactivity-${a}`);
			}), function() {
				document.body.classList.remove(`block-interactivity-${a}`), e.forEach(function(e) {
					return e.classList.remove(`allow-interactivity-${a}`);
				});
			};
		}
	}, [
		t.inert,
		t.lockRef.current,
		t.shards
	]);
	var c = e.useCallback(function(e, t) {
		if ("touches" in e && e.touches.length === 2 || e.type === "wheel" && e.ctrlKey) return !s.current.allowPinchZoom;
		var n = o_(e), a = r.current, o = "deltaX" in e ? e.deltaX : a[0] - n[0], c = "deltaY" in e ? e.deltaY : a[1] - n[1], l, u = e.target, d = Math.abs(o) > Math.abs(c) ? "h" : "v";
		if ("touches" in e && d === "h" && u.type === "range") return !1;
		var f = $g(d, u);
		if (!f) return !0;
		if (f ? l = d : (l = d === "v" ? "h" : "v", f = $g(d, u)), !f) return !1;
		if (!i.current && "changedTouches" in e && (o || c) && (i.current = l), !l) return !0;
		var p = i.current || l;
		return a_(p, t, e, p === "h" ? o : c, !0);
	}, []), l = e.useCallback(function(e) {
		var t = e;
		if (f_.length && f_[f_.length - 1] === o) {
			var r = "deltaY" in t ? s_(t) : o_(t), i = n.current.filter(function(e) {
				return e.name === t.type && (e.target === t.target || t.target === e.shadowParent) && l_(e.delta, r);
			})[0];
			if (i && i.should) t.cancelable && t.preventDefault();
			else if (!i) {
				var a = (s.current.shards || []).map(c_).filter(Boolean).filter(function(e) {
					return e.contains(t.target);
				});
				(a.length > 0 ? c(t, a[0]) : !s.current.noIsolation) && t.cancelable && t.preventDefault();
			}
		}
	}, []), u = e.useCallback(function(e, t, r, i) {
		var a = {
			name: e,
			delta: t,
			target: r,
			should: i,
			shadowParent: m_(r)
		};
		n.current.push(a), setTimeout(function() {
			n.current = n.current.filter(function(e) {
				return e !== a;
			});
		}, 1);
	}, []), d = e.useCallback(function(e) {
		r.current = o_(e), i.current = void 0;
	}, []), f = e.useCallback(function(e) {
		u(e.type, s_(e), e.target, c(e, t.lockRef.current));
	}, []), p = e.useCallback(function(e) {
		u(e.type, o_(e), e.target, c(e, t.lockRef.current));
	}, []);
	e.useEffect(function() {
		return f_.push(o), t.setCallbacks({
			onScrollCapture: f,
			onWheelCapture: f,
			onTouchMoveCapture: p
		}), document.addEventListener("wheel", l, Jg), document.addEventListener("touchmove", l, Jg), document.addEventListener("touchstart", d, Jg), function() {
			f_ = f_.filter(function(e) {
				return e !== o;
			}), document.removeEventListener("wheel", l, Jg), document.removeEventListener("touchmove", l, Jg), document.removeEventListener("touchstart", d, Jg);
		};
	}, []);
	var m = t.removeScrollBar, h = t.inert;
	return e.createElement(e.Fragment, null, h ? e.createElement(o, { styles: u_(a) }) : null, m ? e.createElement(Gg, {
		noRelative: t.noRelative,
		gapMode: t.gapMode
	}) : null);
}
function m_(e) {
	for (var t = null; e !== null;) e instanceof ShadowRoot && (t = e.host, e = e.host), e = e.parentNode;
	return t;
}
// ../build-deps/node_modules/react-remove-scroll/dist/es2015/sidecar.js
var h_ = Tg(Eg, p_), g_ = e.forwardRef(function(t, n) {
	return e.createElement(Og, lg({}, t, {
		ref: n,
		sideCar: h_
	}));
});
g_.classNames = Og.classNames;
// ../build-deps/node_modules/@radix-ui/react-menu/dist/index.mjs
var __ = ["Enter", " "], v_ = [
	"ArrowDown",
	"PageUp",
	"Home"
], y_ = [
	"ArrowUp",
	"PageDown",
	"End"
], b_ = [...v_, ...y_], x_ = {
	ltr: [...__, "ArrowRight"],
	rtl: [...__, "ArrowLeft"]
}, S_ = {
	ltr: ["ArrowLeft"],
	rtl: ["ArrowRight"]
}, C_ = "Menu", [w_, T_, E_] = Gd(C_), [D_, O_] = Md(C_, [
	E_,
	nh,
	Bh
]), k_ = nh(), A_ = Bh(), [j_, M_] = D_(C_), [N_, P_] = D_(C_), F_ = (t) => {
	let { __scopeMenu: n, open: r = !1, children: i, dir: a, onOpenChange: o, modal: s = !0 } = t, c = k_(n), [l, u] = e.useState(null), d = e.useRef(!1), f = Jd(o), p = qd(a);
	return e.useEffect(() => {
		let e = () => {
			d.current = !0, document.addEventListener("pointerdown", t, {
				capture: !0,
				once: !0
			}), document.addEventListener("pointermove", t, {
				capture: !0,
				once: !0
			});
		}, t = () => d.current = !1;
		return document.addEventListener("keydown", e, { capture: !0 }), () => {
			document.removeEventListener("keydown", e, { capture: !0 }), document.removeEventListener("pointerdown", t, { capture: !0 }), document.removeEventListener("pointermove", t, { capture: !0 });
		};
	}, []), /* @__PURE__ */ v(vh, {
		...c,
		children: /* @__PURE__ */ v(j_, {
			scope: n,
			open: r,
			onOpenChange: f,
			content: l,
			onContentChange: u,
			children: /* @__PURE__ */ v(N_, {
				scope: n,
				onClose: e.useCallback(() => f(!1), [f]),
				isUsingKeyboardRef: d,
				dir: p,
				modal: s,
				children: i
			})
		})
	});
};
F_.displayName = C_;
var I_ = "MenuAnchor", L_ = e.forwardRef((e, t) => {
	let { __scopeMenu: n, ...r } = e, i = k_(n);
	return /* @__PURE__ */ v(yh, {
		...i,
		...r,
		ref: t
	});
});
L_.displayName = I_;
var R_ = "MenuPortal", [z_, B_] = D_(R_, { forceMount: void 0 }), V_ = (e) => {
	let { __scopeMenu: t, forceMount: n, children: r, container: i } = e, a = M_(R_, t);
	return /* @__PURE__ */ v(z_, {
		scope: t,
		forceMount: n,
		children: /* @__PURE__ */ v(Th, {
			present: n || a.open,
			children: /* @__PURE__ */ v(Ch, {
				asChild: !0,
				container: i,
				children: r
			})
		})
	});
};
V_.displayName = R_;
var H_ = "MenuContent", [U_, W_] = D_(H_), G_ = e.forwardRef((e, t) => {
	let n = B_(H_, e.__scopeMenu), { forceMount: r = n.forceMount, ...i } = e, a = M_(H_, e.__scopeMenu), o = P_(H_, e.__scopeMenu);
	return /* @__PURE__ */ v(w_.Provider, {
		scope: e.__scopeMenu,
		children: /* @__PURE__ */ v(Th, {
			present: r || a.open,
			children: /* @__PURE__ */ v(w_.Slot, {
				scope: e.__scopeMenu,
				children: o.modal ? /* @__PURE__ */ v(K_, {
					...i,
					ref: t
				}) : /* @__PURE__ */ v(q_, {
					...i,
					ref: t
				})
			})
		})
	});
}), K_ = e.forwardRef((t, n) => {
	let r = M_(H_, t.__scopeMenu), i = e.useRef(null), a = Id(n, i);
	return e.useEffect(() => {
		let e = i.current;
		if (e) return cg(e);
	}, []), /* @__PURE__ */ v(Y_, {
		...t,
		ref: a,
		trapFocus: r.open,
		disableOutsidePointerEvents: r.open,
		disableOutsideScroll: !0,
		onFocusOutside: $(t.onFocusOutside, (e) => e.preventDefault(), { checkForDefaultPrevented: !1 }),
		onDismiss: () => r.onOpenChange(!1)
	});
}), q_ = e.forwardRef((e, t) => {
	let n = M_(H_, e.__scopeMenu);
	return /* @__PURE__ */ v(Y_, {
		...e,
		ref: t,
		trapFocus: !1,
		disableOutsidePointerEvents: !1,
		disableOutsideScroll: !1,
		onDismiss: () => n.onOpenChange(!1)
	});
}), J_ = /* @__PURE__ */ Ld("MenuContent.ScrollLock"), Y_ = e.forwardRef((t, n) => {
	let { __scopeMenu: r, loop: i = !1, trapFocus: a, onOpenAutoFocus: o, onCloseAutoFocus: s, disableOutsidePointerEvents: c, onEntryFocus: l, onEscapeKeyDown: u, onPointerDownOutside: d, onFocusOutside: f, onInteractOutside: p, onDismiss: m, disableOutsideScroll: h, ...g } = t, _ = M_(H_, r), y = P_(H_, r), b = k_(r), x = A_(r), S = T_(r), [C, w] = e.useState(null), T = e.useRef(null), E = Id(n, T, _.onContentChange), ee = e.useRef(0), D = e.useRef(""), te = e.useRef(0), O = e.useRef(null), k = e.useRef("right"), A = e.useRef(0), j = h ? g_ : e.Fragment, M = h ? {
		as: J_,
		allowPinchZoom: !0
	} : void 0, N = (e) => {
		let t = D.current + e, n = S().filter((e) => !e.disabled), r = document.activeElement, i = n.find((e) => e.ref.current === r)?.textValue, a = jv(n.map((e) => e.textValue), t, i), o = n.find((e) => e.textValue === a)?.ref.current;
		(function e(t) {
			D.current = t, window.clearTimeout(ee.current), t !== "" && (ee.current = window.setTimeout(() => e(""), 1e3));
		})(t), o && setTimeout(() => o.focus());
	};
	e.useEffect(() => () => window.clearTimeout(ee.current), []), df();
	let P = e.useCallback((e) => k.current === O.current?.side && Nv(e, O.current?.area), []);
	return /* @__PURE__ */ v(U_, {
		scope: r,
		searchRef: D,
		onItemEnter: e.useCallback((e) => {
			P(e) && e.preventDefault();
		}, [P]),
		onItemLeave: e.useCallback((e) => {
			P(e) || (T.current?.focus(), w(null));
		}, [P]),
		onTriggerLeave: e.useCallback((e) => {
			P(e) && e.preventDefault();
		}, [P]),
		pointerGraceTimerRef: te,
		onPointerGraceIntentChange: e.useCallback((e) => {
			O.current = e;
		}, []),
		children: /* @__PURE__ */ v(j, {
			...M,
			children: /* @__PURE__ */ v(_f, {
				asChild: !0,
				trapped: a,
				onMountAutoFocus: $(o, (e) => {
					e.preventDefault(), T.current?.focus({ preventScroll: !0 });
				}),
				onUnmountAutoFocus: s,
				children: /* @__PURE__ */ v(nf, {
					asChild: !0,
					disableOutsidePointerEvents: c,
					onEscapeKeyDown: u,
					onPointerDownOutside: d,
					onFocusOutside: f,
					onInteractOutside: p,
					onDismiss: m,
					children: /* @__PURE__ */ v(Qh, {
						asChild: !0,
						...x,
						dir: y.dir,
						orientation: "vertical",
						loop: i,
						currentTabStopId: C,
						onCurrentTabStopIdChange: w,
						onEntryFocus: $(l, (e) => {
							y.isUsingKeyboardRef.current || e.preventDefault();
						}),
						preventScrollOnEntryFocus: !0,
						children: /* @__PURE__ */ v(bh, {
							role: "menu",
							"aria-orientation": "vertical",
							"data-state": Ev(_.open),
							"data-radix-menu-content": "",
							dir: y.dir,
							...b,
							...g,
							ref: E,
							style: {
								outline: "none",
								...g.style
							},
							onKeyDown: $(g.onKeyDown, (e) => {
								let t = e.target.closest("[data-radix-menu-content]") === e.currentTarget, n = e.ctrlKey || e.altKey || e.metaKey, r = e.key.length === 1;
								t && (e.key === "Tab" && e.preventDefault(), !n && r && N(e.key));
								let i = T.current;
								if (e.target !== i || !b_.includes(e.key)) return;
								e.preventDefault();
								let a = S().filter((e) => !e.disabled).map((e) => e.ref.current);
								y_.includes(e.key) && a.reverse(), kv(a);
							}),
							onBlur: $(t.onBlur, (e) => {
								e.currentTarget.contains(e.target) || (window.clearTimeout(ee.current), D.current = "");
							}),
							onPointerMove: $(t.onPointerMove, Pv((e) => {
								let t = e.target, n = A.current !== e.clientX;
								if (e.currentTarget.contains(t) && n) {
									let t = e.clientX > A.current ? "right" : "left";
									k.current = t, A.current = e.clientX;
								}
							}))
						})
					})
				})
			})
		})
	});
});
G_.displayName = H_;
var X_ = "MenuGroup", Z_ = e.forwardRef((e, t) => {
	let { __scopeMenu: n, ...r } = e;
	return /* @__PURE__ */ v(Ud.div, {
		role: "group",
		...r,
		ref: t
	});
});
Z_.displayName = X_;
var Q_ = "MenuLabel", $_ = e.forwardRef((e, t) => {
	let { __scopeMenu: n, ...r } = e;
	return /* @__PURE__ */ v(Ud.div, {
		...r,
		ref: t
	});
});
$_.displayName = Q_;
var ev = "MenuItem", tv = "menu.itemSelect", nv = e.forwardRef((t, n) => {
	let { disabled: r = !1, onSelect: i, ...a } = t, o = e.useRef(null), s = P_(ev, t.__scopeMenu), c = W_(ev, t.__scopeMenu), l = Id(n, o), u = e.useRef(!1), d = () => {
		let e = o.current;
		if (!r && e) {
			let t = new CustomEvent(tv, {
				bubbles: !0,
				cancelable: !0
			});
			e.addEventListener(tv, (e) => i?.(e), { once: !0 }), Wd(e, t), t.defaultPrevented ? u.current = !1 : s.onClose();
		}
	};
	return /* @__PURE__ */ v(rv, {
		...a,
		ref: l,
		disabled: r,
		onClick: $(t.onClick, d),
		onPointerDown: (e) => {
			t.onPointerDown?.(e), u.current = !0;
		},
		onPointerUp: $(t.onPointerUp, (e) => {
			u.current || e.currentTarget?.click();
		}),
		onKeyDown: $(t.onKeyDown, (e) => {
			let t = c.searchRef.current !== "";
			r || t && e.key === " " || __.includes(e.key) && (e.currentTarget.click(), e.preventDefault());
		})
	});
});
nv.displayName = ev;
var rv = e.forwardRef((t, n) => {
	let { __scopeMenu: r, disabled: i = !1, textValue: a, ...o } = t, s = W_(ev, r), c = A_(r), l = e.useRef(null), u = Id(n, l), [d, f] = e.useState(!1), [p, m] = e.useState("");
	return e.useEffect(() => {
		let e = l.current;
		e && m((e.textContent ?? "").trim());
	}, [o.children]), /* @__PURE__ */ v(w_.ItemSlot, {
		scope: r,
		disabled: i,
		textValue: a ?? p,
		children: /* @__PURE__ */ v($h, {
			asChild: !0,
			...c,
			focusable: !i,
			children: /* @__PURE__ */ v(Ud.div, {
				role: "menuitem",
				"data-highlighted": d ? "" : void 0,
				"aria-disabled": i || void 0,
				"data-disabled": i ? "" : void 0,
				...o,
				ref: u,
				onPointerMove: $(t.onPointerMove, Pv((e) => {
					i ? s.onItemLeave(e) : (s.onItemEnter(e), e.defaultPrevented || e.currentTarget.focus({ preventScroll: !0 }));
				})),
				onPointerLeave: $(t.onPointerLeave, Pv((e) => s.onItemLeave(e))),
				onFocus: $(t.onFocus, () => f(!0)),
				onBlur: $(t.onBlur, () => f(!1))
			})
		})
	});
}), iv = "MenuCheckboxItem", av = e.forwardRef((e, t) => {
	let { checked: n = !1, onCheckedChange: r, ...i } = e;
	return /* @__PURE__ */ v(pv, {
		scope: e.__scopeMenu,
		checked: n,
		children: /* @__PURE__ */ v(nv, {
			role: "menuitemcheckbox",
			"aria-checked": Dv(n) ? "mixed" : n,
			...i,
			ref: t,
			"data-state": Ov(n),
			onSelect: $(i.onSelect, () => r?.(Dv(n) ? !0 : !n), { checkForDefaultPrevented: !1 })
		})
	});
});
av.displayName = iv;
var ov = "MenuRadioGroup", [sv, cv] = D_(ov, {
	value: void 0,
	onValueChange: () => {}
}), lv = e.forwardRef((e, t) => {
	let { value: n, onValueChange: r, ...i } = e, a = Jd(r);
	return /* @__PURE__ */ v(sv, {
		scope: e.__scopeMenu,
		value: n,
		onValueChange: a,
		children: /* @__PURE__ */ v(Z_, {
			...i,
			ref: t
		})
	});
});
lv.displayName = ov;
var uv = "MenuRadioItem", dv = e.forwardRef((e, t) => {
	let { value: n, ...r } = e, i = cv(uv, e.__scopeMenu), a = n === i.value;
	return /* @__PURE__ */ v(pv, {
		scope: e.__scopeMenu,
		checked: a,
		children: /* @__PURE__ */ v(nv, {
			role: "menuitemradio",
			"aria-checked": a,
			...r,
			ref: t,
			"data-state": Ov(a),
			onSelect: $(r.onSelect, () => i.onValueChange?.(n), { checkForDefaultPrevented: !1 })
		})
	});
});
dv.displayName = uv;
var fv = "MenuItemIndicator", [pv, mv] = D_(fv, { checked: !1 }), hv = e.forwardRef((e, t) => {
	let { __scopeMenu: n, forceMount: r, ...i } = e, a = mv(fv, n);
	return /* @__PURE__ */ v(Th, {
		present: r || Dv(a.checked) || a.checked === !0,
		children: /* @__PURE__ */ v(Ud.span, {
			...i,
			ref: t,
			"data-state": Ov(a.checked)
		})
	});
});
hv.displayName = fv;
var gv = "MenuSeparator", _v = e.forwardRef((e, t) => {
	let { __scopeMenu: n, ...r } = e;
	return /* @__PURE__ */ v(Ud.div, {
		role: "separator",
		"aria-orientation": "horizontal",
		...r,
		ref: t
	});
});
_v.displayName = gv;
var vv = "MenuArrow", yv = e.forwardRef((e, t) => {
	let { __scopeMenu: n, ...r } = e, i = k_(n);
	return /* @__PURE__ */ v(xh, {
		...i,
		...r,
		ref: t
	});
});
yv.displayName = vv;
var [bv, xv] = D_("MenuSub"), Sv = "MenuSubTrigger", Cv = e.forwardRef((t, n) => {
	let r = M_(Sv, t.__scopeMenu), i = P_(Sv, t.__scopeMenu), a = xv(Sv, t.__scopeMenu), o = W_(Sv, t.__scopeMenu), s = e.useRef(null), { pointerGraceTimerRef: c, onPointerGraceIntentChange: l } = o, u = { __scopeMenu: t.__scopeMenu }, d = e.useCallback(() => {
		s.current && window.clearTimeout(s.current), s.current = null;
	}, []);
	return e.useEffect(() => d, [d]), e.useEffect(() => {
		let e = c.current;
		return () => {
			window.clearTimeout(e), l(null);
		};
	}, [c, l]), /* @__PURE__ */ v(L_, {
		asChild: !0,
		...u,
		children: /* @__PURE__ */ v(rv, {
			id: a.triggerId,
			"aria-haspopup": "menu",
			"aria-expanded": r.open,
			"aria-controls": a.contentId,
			"data-state": Ev(r.open),
			...t,
			ref: Fd(n, a.onTriggerChange),
			onClick: (e) => {
				t.onClick?.(e), !(t.disabled || e.defaultPrevented) && (e.currentTarget.focus(), r.open || r.onOpenChange(!0));
			},
			onPointerMove: $(t.onPointerMove, Pv((e) => {
				o.onItemEnter(e), e.defaultPrevented || t.disabled || r.open || s.current || (o.onPointerGraceIntentChange(null), s.current = window.setTimeout(() => {
					r.onOpenChange(!0), d();
				}, 100));
			})),
			onPointerLeave: $(t.onPointerLeave, Pv((e) => {
				d();
				let t = r.content?.getBoundingClientRect();
				if (t) {
					let n = r.content?.dataset.side, i = n === "right", a = i ? -5 : 5, s = t[i ? "left" : "right"], l = t[i ? "right" : "left"];
					o.onPointerGraceIntentChange({
						area: [
							{
								x: e.clientX + a,
								y: e.clientY
							},
							{
								x: s,
								y: t.top
							},
							{
								x: l,
								y: t.top
							},
							{
								x: l,
								y: t.bottom
							},
							{
								x: s,
								y: t.bottom
							}
						],
						side: n
					}), window.clearTimeout(c.current), c.current = window.setTimeout(() => o.onPointerGraceIntentChange(null), 300);
				} else {
					if (o.onTriggerLeave(e), e.defaultPrevented) return;
					o.onPointerGraceIntentChange(null);
				}
			})),
			onKeyDown: $(t.onKeyDown, (e) => {
				let n = o.searchRef.current !== "";
				t.disabled || n && e.key === " " || x_[i.dir].includes(e.key) && (r.onOpenChange(!0), r.content?.focus(), e.preventDefault());
			})
		})
	});
});
Cv.displayName = Sv;
var wv = "MenuSubContent", Tv = e.forwardRef((t, n) => {
	let r = B_(H_, t.__scopeMenu), { forceMount: i = r.forceMount, ...a } = t, o = M_(H_, t.__scopeMenu), s = P_(H_, t.__scopeMenu), c = xv(wv, t.__scopeMenu), l = e.useRef(null), u = Id(n, l);
	return /* @__PURE__ */ v(w_.Provider, {
		scope: t.__scopeMenu,
		children: /* @__PURE__ */ v(Th, {
			present: i || o.open,
			children: /* @__PURE__ */ v(w_.Slot, {
				scope: t.__scopeMenu,
				children: /* @__PURE__ */ v(Y_, {
					id: c.contentId,
					"aria-labelledby": c.triggerId,
					...a,
					ref: u,
					align: "start",
					side: s.dir === "rtl" ? "left" : "right",
					disableOutsidePointerEvents: !1,
					disableOutsideScroll: !1,
					trapFocus: !1,
					onOpenAutoFocus: (e) => {
						s.isUsingKeyboardRef.current && l.current?.focus(), e.preventDefault();
					},
					onCloseAutoFocus: (e) => e.preventDefault(),
					onFocusOutside: $(t.onFocusOutside, (e) => {
						e.target !== c.trigger && o.onOpenChange(!1);
					}),
					onEscapeKeyDown: $(t.onEscapeKeyDown, (e) => {
						s.onClose(), e.preventDefault();
					}),
					onKeyDown: $(t.onKeyDown, (e) => {
						let t = e.currentTarget.contains(e.target), n = S_[s.dir].includes(e.key);
						t && n && (o.onOpenChange(!1), c.trigger?.focus(), e.preventDefault());
					})
				})
			})
		})
	});
});
Tv.displayName = wv;
function Ev(e) {
	return e ? "open" : "closed";
}
function Dv(e) {
	return e === "indeterminate";
}
function Ov(e) {
	return Dv(e) ? "indeterminate" : e ? "checked" : "unchecked";
}
function kv(e) {
	let t = document.activeElement;
	for (let n of e) if (n === t || (n.focus(), document.activeElement !== t)) return;
}
function Av(e, t) {
	return e.map((n, r) => e[(t + r) % e.length]);
}
function jv(e, t, n) {
	let r = t.length > 1 && Array.from(t).every((e) => e === t[0]) ? t[0] : t, i = n ? e.indexOf(n) : -1, a = Av(e, Math.max(i, 0));
	r.length === 1 && (a = a.filter((e) => e !== n));
	let o = a.find((e) => e.toLowerCase().startsWith(r.toLowerCase()));
	return o === n ? void 0 : o;
}
function Mv(e, t) {
	let { x: n, y: r } = e, i = !1;
	for (let e = 0, a = t.length - 1; e < t.length; a = e++) {
		let o = t[e], s = t[a], c = o.x, l = o.y, u = s.x, d = s.y;
		l > r != d > r && n < (u - c) * (r - l) / (d - l) + c && (i = !i);
	}
	return i;
}
function Nv(e, t) {
	return t ? Mv({
		x: e.clientX,
		y: e.clientY
	}, t) : !1;
}
function Pv(e) {
	return (t) => t.pointerType === "mouse" ? e(t) : void 0;
}
var Fv = F_, Iv = L_, Lv = V_, Rv = G_, zv = Z_, Bv = $_, Vv = nv, Hv = av, Uv = lv, Wv = dv, Gv = hv, Kv = _v, qv = yv, Jv = Cv, Yv = Tv, Xv = "ContextMenu", [Zv, Qv] = Md(Xv, [O_]), $v = O_(), [ey, ty] = Zv(Xv), ny = (t) => {
	let { __scopeContextMenu: n, children: r, onOpenChange: i, dir: a, modal: o = !0 } = t, [s, c] = e.useState(!1), l = $v(n), u = Jd(i), d = e.useCallback((e) => {
		c(e), u(e);
	}, [u]);
	return /* @__PURE__ */ v(ey, {
		scope: n,
		open: s,
		onOpenChange: d,
		modal: o,
		children: /* @__PURE__ */ v(Fv, {
			...l,
			dir: a,
			open: s,
			onOpenChange: d,
			modal: o,
			children: r
		})
	});
};
ny.displayName = Xv;
var ry = "ContextMenuTrigger", iy = e.forwardRef((t, n) => {
	let { __scopeContextMenu: r, disabled: i = !1, ...a } = t, o = ty(ry, r), s = $v(r), c = e.useRef({
		x: 0,
		y: 0
	}), l = e.useRef({ getBoundingClientRect: () => DOMRect.fromRect({
		width: 0,
		height: 0,
		...c.current
	}) }), u = e.useRef(0), d = e.useCallback(() => window.clearTimeout(u.current), []), f = (e) => {
		c.current = {
			x: e.clientX,
			y: e.clientY
		}, o.onOpenChange(!0);
	};
	return e.useEffect(() => d, [d]), e.useEffect(() => void (i && d()), [i, d]), /* @__PURE__ */ y(_, { children: [/* @__PURE__ */ v(Iv, {
		...s,
		virtualRef: l
	}), /* @__PURE__ */ v(Ud.span, {
		"data-state": o.open ? "open" : "closed",
		"data-disabled": i ? "" : void 0,
		...a,
		ref: n,
		style: {
			WebkitTouchCallout: "none",
			...t.style
		},
		onContextMenu: i ? t.onContextMenu : $(t.onContextMenu, (e) => {
			d(), f(e), e.preventDefault();
		}),
		onPointerDown: i ? t.onPointerDown : $(t.onPointerDown, jy((e) => {
			d(), u.current = window.setTimeout(() => f(e), 700);
		})),
		onPointerMove: i ? t.onPointerMove : $(t.onPointerMove, jy(d)),
		onPointerCancel: i ? t.onPointerCancel : $(t.onPointerCancel, jy(d)),
		onPointerUp: i ? t.onPointerUp : $(t.onPointerUp, jy(d))
	})] });
});
iy.displayName = ry;
var ay = "ContextMenuPortal", oy = (e) => {
	let { __scopeContextMenu: t, ...n } = e, r = $v(t);
	return /* @__PURE__ */ v(Lv, {
		...r,
		...n
	});
};
oy.displayName = ay;
var sy = "ContextMenuContent", cy = e.forwardRef((t, n) => {
	let { __scopeContextMenu: r, ...i } = t, a = ty(sy, r), o = $v(r), s = e.useRef(!1);
	return /* @__PURE__ */ v(Rv, {
		...o,
		...i,
		ref: n,
		side: "right",
		sideOffset: 2,
		align: "start",
		onCloseAutoFocus: (e) => {
			t.onCloseAutoFocus?.(e), !e.defaultPrevented && s.current && e.preventDefault(), s.current = !1;
		},
		onInteractOutside: (e) => {
			t.onInteractOutside?.(e), !e.defaultPrevented && !a.modal && (s.current = !0);
		},
		style: {
			...t.style,
			"--radix-context-menu-content-transform-origin": "var(--radix-popper-transform-origin)",
			"--radix-context-menu-content-available-width": "var(--radix-popper-available-width)",
			"--radix-context-menu-content-available-height": "var(--radix-popper-available-height)",
			"--radix-context-menu-trigger-width": "var(--radix-popper-anchor-width)",
			"--radix-context-menu-trigger-height": "var(--radix-popper-anchor-height)"
		}
	});
});
cy.displayName = sy;
var ly = "ContextMenuGroup", uy = e.forwardRef((e, t) => {
	let { __scopeContextMenu: n, ...r } = e, i = $v(n);
	return /* @__PURE__ */ v(zv, {
		...i,
		...r,
		ref: t
	});
});
uy.displayName = ly;
var dy = "ContextMenuLabel", fy = e.forwardRef((e, t) => {
	let { __scopeContextMenu: n, ...r } = e, i = $v(n);
	return /* @__PURE__ */ v(Bv, {
		...i,
		...r,
		ref: t
	});
});
fy.displayName = dy;
var py = "ContextMenuItem", my = e.forwardRef((e, t) => {
	let { __scopeContextMenu: n, ...r } = e, i = $v(n);
	return /* @__PURE__ */ v(Vv, {
		...i,
		...r,
		ref: t
	});
});
my.displayName = py;
var hy = "ContextMenuCheckboxItem", gy = e.forwardRef((e, t) => {
	let { __scopeContextMenu: n, ...r } = e, i = $v(n);
	return /* @__PURE__ */ v(Hv, {
		...i,
		...r,
		ref: t
	});
});
gy.displayName = hy;
var _y = "ContextMenuRadioGroup", vy = e.forwardRef((e, t) => {
	let { __scopeContextMenu: n, ...r } = e, i = $v(n);
	return /* @__PURE__ */ v(Uv, {
		...i,
		...r,
		ref: t
	});
});
vy.displayName = _y;
var yy = "ContextMenuRadioItem", by = e.forwardRef((e, t) => {
	let { __scopeContextMenu: n, ...r } = e, i = $v(n);
	return /* @__PURE__ */ v(Wv, {
		...i,
		...r,
		ref: t
	});
});
by.displayName = yy;
var xy = "ContextMenuItemIndicator", Sy = e.forwardRef((e, t) => {
	let { __scopeContextMenu: n, ...r } = e, i = $v(n);
	return /* @__PURE__ */ v(Gv, {
		...i,
		...r,
		ref: t
	});
});
Sy.displayName = xy;
var Cy = "ContextMenuSeparator", wy = e.forwardRef((e, t) => {
	let { __scopeContextMenu: n, ...r } = e, i = $v(n);
	return /* @__PURE__ */ v(Kv, {
		...i,
		...r,
		ref: t
	});
});
wy.displayName = Cy;
var Ty = "ContextMenuArrow", Ey = e.forwardRef((e, t) => {
	let { __scopeContextMenu: n, ...r } = e, i = $v(n);
	return /* @__PURE__ */ v(qv, {
		...i,
		...r,
		ref: t
	});
});
Ey.displayName = Ty;
var Dy = "ContextMenuSubTrigger", Oy = e.forwardRef((e, t) => {
	let { __scopeContextMenu: n, ...r } = e, i = $v(n);
	return /* @__PURE__ */ v(Jv, {
		...i,
		...r,
		ref: t
	});
});
Oy.displayName = Dy;
var ky = "ContextMenuSubContent", Ay = e.forwardRef((e, t) => {
	let { __scopeContextMenu: n, ...r } = e, i = $v(n);
	return /* @__PURE__ */ v(Yv, {
		...i,
		...r,
		ref: t,
		style: {
			...e.style,
			"--radix-context-menu-content-transform-origin": "var(--radix-popper-transform-origin)",
			"--radix-context-menu-content-available-width": "var(--radix-popper-available-width)",
			"--radix-context-menu-content-available-height": "var(--radix-popper-available-height)",
			"--radix-context-menu-trigger-width": "var(--radix-popper-anchor-width)",
			"--radix-context-menu-trigger-height": "var(--radix-popper-anchor-height)"
		}
	});
});
Ay.displayName = ky;
function jy(e) {
	return (t) => t.pointerType === "mouse" ? void 0 : e(t);
}
var My = ny, Ny = iy, Py = oy, Fy = cy, Iy = fy, Ly = my, Ry = gy, zy = by, By = Sy, Vy = wy, Hy = Oy, Uy = Ay;
// ../build-deps/node_modules/clsx/dist/clsx.mjs
function Wy(e) {
	var t, n, r = "";
	if (typeof e == "string" || typeof e == "number") r += e;
	else if (typeof e == "object") {
		if (Array.isArray(e)) {
			var i = e.length;
			for (t = 0; t < i; t++) e[t] && (n = Wy(e[t])) && (r && (r += " "), r += n);
		} else for (n in e) e[n] && (r && (r += " "), r += n);
	}
	return r;
}
function Gy() {
	for (var e, t, n = 0, r = "", i = arguments.length; n < i; n++) (e = arguments[n]) && (t = Wy(e)) && (r && (r += " "), r += t);
	return r;
}
// ../shared-node/src/components/ui/utils.jsx
var Ky = (/* @__PURE__ */ ee(((e) => {
	Object.defineProperty(e, Symbol.toStringTag, { value: "Module" });
	var t = "-", n = (e) => {
		let n = o(e), { conflictingClassGroups: i, conflictingClassGroupModifiers: s } = e;
		return {
			getClassGroupId: (e) => {
				let i = e.split(t);
				return i[0] === "" && i.length !== 1 && i.shift(), r(i, n) || a(e);
			},
			getConflictingClassGroupIds: (e, t) => {
				let n = i[e] || [];
				return t && s[e] ? [...n, ...s[e]] : n;
			}
		};
	}, r = (e, n) => {
		if (e.length === 0) return n.classGroupId;
		let i = e[0], a = n.nextPart.get(i), o = a ? r(e.slice(1), a) : void 0;
		if (o) return o;
		if (n.validators.length === 0) return;
		let s = e.join(t);
		return n.validators.find(({ validator: e }) => e(s))?.classGroupId;
	}, i = /^\[(.+)\]$/, a = (e) => {
		if (i.test(e)) {
			let t = i.exec(e)[1], n = t?.substring(0, t.indexOf(":"));
			if (n) return "arbitrary.." + n;
		}
	}, o = (e) => {
		let { theme: t, classGroups: n } = e, r = {
			nextPart: /* @__PURE__ */ new Map(),
			validators: []
		};
		for (let e in n) s(n[e], r, e, t);
		return r;
	}, s = (e, t, n, r) => {
		e.forEach((e) => {
			if (typeof e == "string") {
				let r = e === "" ? t : c(t, e);
				r.classGroupId = n;
			} else if (typeof e == "function") {
				if (l(e)) {
					s(e(r), t, n, r);
					return;
				}
				t.validators.push({
					validator: e,
					classGroupId: n
				});
			} else Object.entries(e).forEach(([e, i]) => {
				s(i, c(t, e), n, r);
			});
		});
	}, c = (e, n) => {
		let r = e;
		return n.split(t).forEach((e) => {
			r.nextPart.has(e) || r.nextPart.set(e, {
				nextPart: /* @__PURE__ */ new Map(),
				validators: []
			}), r = r.nextPart.get(e);
		}), r;
	}, l = (e) => e.isThemeGetter, u = (e) => {
		if (e < 1) return {
			get: () => void 0,
			set: () => {}
		};
		let t = 0, n = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map(), i = (i, a) => {
			n.set(i, a), t++, t > e && (t = 0, r = n, n = /* @__PURE__ */ new Map());
		};
		return {
			get(e) {
				let t = n.get(e);
				if (t !== void 0) return t;
				if ((t = r.get(e)) !== void 0) return i(e, t), t;
			},
			set(e, t) {
				n.has(e) ? n.set(e, t) : i(e, t);
			}
		};
	}, d = "!", f = ":", p = 1, m = (e) => {
		let { prefix: t, experimentalParseClassName: n } = e, r = (e) => {
			let t = [], n = 0, r = 0, i = 0, a;
			for (let o = 0; o < e.length; o++) {
				let s = e[o];
				if (n === 0 && r === 0) {
					if (s === f) {
						t.push(e.slice(i, o)), i = o + p;
						continue;
					}
					if (s === "/") {
						a = o;
						continue;
					}
				}
				s === "[" ? n++ : s === "]" ? n-- : s === "(" ? r++ : s === ")" && r--;
			}
			let o = t.length === 0 ? e : e.substring(i), s = h(o);
			return {
				modifiers: t,
				hasImportantModifier: s !== o,
				baseClassName: s,
				maybePostfixModifierPosition: a && a > i ? a - i : void 0
			};
		};
		if (t) {
			let e = t + f, n = r;
			r = (t) => t.startsWith(e) ? n(t.substring(e.length)) : {
				isExternal: !0,
				modifiers: [],
				hasImportantModifier: !1,
				baseClassName: t,
				maybePostfixModifierPosition: void 0
			};
		}
		if (n) {
			let e = r;
			r = (t) => n({
				className: t,
				parseClassName: e
			});
		}
		return r;
	}, h = (e) => e.endsWith(d) ? e.substring(0, e.length - 1) : e.startsWith(d) ? e.substring(1) : e, g = (e) => {
		let t = Object.fromEntries(e.orderSensitiveModifiers.map((e) => [e, !0]));
		return (e) => {
			if (e.length <= 1) return e;
			let n = [], r = [];
			return e.forEach((e) => {
				e[0] === "[" || t[e] ? (n.push(...r.sort(), e), r = []) : r.push(e);
			}), n.push(...r.sort()), n;
		};
	}, _ = (e) => ({
		cache: u(e.cacheSize),
		parseClassName: m(e),
		sortModifiers: g(e),
		...n(e)
	}), v = /\s+/, y = (e, t) => {
		let { parseClassName: n, getClassGroupId: r, getConflictingClassGroupIds: i, sortModifiers: a } = t, o = [], s = e.trim().split(v), c = "";
		for (let e = s.length - 1; e >= 0; --e) {
			let t = s[e], { isExternal: l, modifiers: u, hasImportantModifier: f, baseClassName: p, maybePostfixModifierPosition: m } = n(t);
			if (l) {
				c = t + (c.length > 0 ? " " + c : c);
				continue;
			}
			let h = !!m, g = r(h ? p.substring(0, m) : p);
			if (!g) {
				if (!h || (g = r(p), !g)) {
					c = t + (c.length > 0 ? " " + c : c);
					continue;
				}
				h = !1;
			}
			let _ = a(u).join(":"), v = f ? _ + d : _, y = v + g;
			if (o.includes(y)) continue;
			o.push(y);
			let b = i(g, h);
			for (let e = 0; e < b.length; ++e) {
				let t = b[e];
				o.push(v + t);
			}
			c = t + (c.length > 0 ? " " + c : c);
		}
		return c;
	};
	function b() {
		let e = 0, t, n, r = "";
		for (; e < arguments.length;) (t = arguments[e++]) && (n = x(t)) && (r && (r += " "), r += n);
		return r;
	}
	var x = (e) => {
		if (typeof e == "string") return e;
		let t, n = "";
		for (let r = 0; r < e.length; r++) e[r] && (t = x(e[r])) && (n && (n += " "), n += t);
		return n;
	};
	function S(e, ...t) {
		let n, r, i, a = o;
		function o(o) {
			return n = _(t.reduce((e, t) => t(e), e())), r = n.cache.get, i = n.cache.set, a = s, s(o);
		}
		function s(e) {
			let t = r(e);
			if (t) return t;
			let a = y(e, n);
			return i(e, a), a;
		}
		return function() {
			return a(b.apply(null, arguments));
		};
	}
	var C = (e) => {
		let t = (t) => t[e] || [];
		return t.isThemeGetter = !0, t;
	}, w = /^\[(?:(\w[\w-]*):)?(.+)\]$/i, T = /^\((?:(\w[\w-]*):)?(.+)\)$/i, E = /^\d+\/\d+$/, ee = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/, D = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/, te = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/, O = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/, k = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/, A = (e) => E.test(e), j = (e) => !!e && !Number.isNaN(Number(e)), M = (e) => !!e && Number.isInteger(Number(e)), N = (e) => e.endsWith("%") && j(e.slice(0, -1)), P = (e) => ee.test(e), ne = () => !0, re = (e) => D.test(e) && !te.test(e), F = () => !1, I = (e) => O.test(e), L = (e) => k.test(e), ie = (e) => !z(e) && !V(e), R = (e) => pe(e, W, F), z = (e) => w.test(e), ae = (e) => pe(e, G, re), oe = (e) => pe(e, _e, j), se = (e) => pe(e, he, F), ce = (e) => pe(e, ge, L), B = (e) => pe(e, q, I), V = (e) => T.test(e), H = (e) => me(e, G), le = (e) => me(e, K), ue = (e) => me(e, he), de = (e) => me(e, W), fe = (e) => me(e, ge), U = (e) => me(e, q, !0), pe = (e, t, n) => {
		let r = w.exec(e);
		return r ? r[1] ? t(r[1]) : n(r[2]) : !1;
	}, me = (e, t, n = !1) => {
		let r = T.exec(e);
		return r ? r[1] ? t(r[1]) : n : !1;
	}, he = (e) => e === "position" || e === "percentage", ge = (e) => e === "image" || e === "url", W = (e) => e === "length" || e === "size" || e === "bg-size", G = (e) => e === "length", _e = (e) => e === "number", K = (e) => e === "family-name", q = (e) => e === "shadow", ve = /*#__PURE__*/ Object.defineProperty({
		__proto__: null,
		isAny: ne,
		isAnyNonArbitrary: ie,
		isArbitraryImage: ce,
		isArbitraryLength: ae,
		isArbitraryNumber: oe,
		isArbitraryPosition: se,
		isArbitraryShadow: B,
		isArbitrarySize: R,
		isArbitraryValue: z,
		isArbitraryVariable: V,
		isArbitraryVariableFamilyName: le,
		isArbitraryVariableImage: fe,
		isArbitraryVariableLength: H,
		isArbitraryVariablePosition: ue,
		isArbitraryVariableShadow: U,
		isArbitraryVariableSize: de,
		isFraction: A,
		isInteger: M,
		isNumber: j,
		isPercent: N,
		isTshirtSize: P
	}, Symbol.toStringTag, { value: "Module" }), ye = () => {
		let e = C("color"), t = C("font"), n = C("text"), r = C("font-weight"), i = C("tracking"), a = C("leading"), o = C("breakpoint"), s = C("container"), c = C("spacing"), l = C("radius"), u = C("shadow"), d = C("inset-shadow"), f = C("text-shadow"), p = C("drop-shadow"), m = C("blur"), h = C("perspective"), g = C("aspect"), _ = C("ease"), v = C("animate"), y = () => [
			"auto",
			"avoid",
			"all",
			"avoid-page",
			"page",
			"left",
			"right",
			"column"
		], b = () => [
			"center",
			"top",
			"bottom",
			"left",
			"right",
			"top-left",
			"left-top",
			"top-right",
			"right-top",
			"bottom-right",
			"right-bottom",
			"bottom-left",
			"left-bottom"
		], x = () => [
			...b(),
			V,
			z
		], S = () => [
			"auto",
			"hidden",
			"clip",
			"visible",
			"scroll"
		], w = () => [
			"auto",
			"contain",
			"none"
		], T = () => [
			V,
			z,
			c
		], E = () => [
			A,
			"full",
			"auto",
			...T()
		], ee = () => [
			M,
			"none",
			"subgrid",
			V,
			z
		], D = () => [
			"auto",
			{ span: [
				"full",
				M,
				V,
				z
			] },
			M,
			V,
			z
		], te = () => [
			M,
			"auto",
			V,
			z
		], O = () => [
			"auto",
			"min",
			"max",
			"fr",
			V,
			z
		], k = () => [
			"start",
			"end",
			"center",
			"between",
			"around",
			"evenly",
			"stretch",
			"baseline",
			"center-safe",
			"end-safe"
		], re = () => [
			"start",
			"end",
			"center",
			"stretch",
			"center-safe",
			"end-safe"
		], F = () => ["auto", ...T()], I = () => [
			A,
			"auto",
			"full",
			"dvw",
			"dvh",
			"lvw",
			"lvh",
			"svw",
			"svh",
			"min",
			"max",
			"fit",
			...T()
		], L = () => [
			e,
			V,
			z
		], pe = () => [
			...b(),
			ue,
			se,
			{ position: [V, z] }
		], me = () => ["no-repeat", { repeat: [
			"",
			"x",
			"y",
			"space",
			"round"
		] }], he = () => [
			"auto",
			"cover",
			"contain",
			de,
			R,
			{ size: [V, z] }
		], ge = () => [
			N,
			H,
			ae
		], W = () => [
			"",
			"none",
			"full",
			l,
			V,
			z
		], G = () => [
			"",
			j,
			H,
			ae
		], _e = () => [
			"solid",
			"dashed",
			"dotted",
			"double"
		], K = () => [
			"normal",
			"multiply",
			"screen",
			"overlay",
			"darken",
			"lighten",
			"color-dodge",
			"color-burn",
			"hard-light",
			"soft-light",
			"difference",
			"exclusion",
			"hue",
			"saturation",
			"color",
			"luminosity"
		], q = () => [
			j,
			N,
			ue,
			se
		], ve = () => [
			"",
			"none",
			m,
			V,
			z
		], ye = () => [
			"none",
			j,
			V,
			z
		], be = () => [
			"none",
			j,
			V,
			z
		], xe = () => [
			j,
			V,
			z
		], Se = () => [
			A,
			"full",
			...T()
		];
		return {
			cacheSize: 500,
			theme: {
				animate: [
					"spin",
					"ping",
					"pulse",
					"bounce"
				],
				aspect: ["video"],
				blur: [P],
				breakpoint: [P],
				color: [ne],
				container: [P],
				"drop-shadow": [P],
				ease: [
					"in",
					"out",
					"in-out"
				],
				font: [ie],
				"font-weight": [
					"thin",
					"extralight",
					"light",
					"normal",
					"medium",
					"semibold",
					"bold",
					"extrabold",
					"black"
				],
				"inset-shadow": [P],
				leading: [
					"none",
					"tight",
					"snug",
					"normal",
					"relaxed",
					"loose"
				],
				perspective: [
					"dramatic",
					"near",
					"normal",
					"midrange",
					"distant",
					"none"
				],
				radius: [P],
				shadow: [P],
				spacing: ["px", j],
				text: [P],
				"text-shadow": [P],
				tracking: [
					"tighter",
					"tight",
					"normal",
					"wide",
					"wider",
					"widest"
				]
			},
			classGroups: {
				aspect: [{ aspect: [
					"auto",
					"square",
					A,
					z,
					V,
					g
				] }],
				container: ["container"],
				columns: [{ columns: [
					j,
					z,
					V,
					s
				] }],
				"break-after": [{ "break-after": y() }],
				"break-before": [{ "break-before": y() }],
				"break-inside": [{ "break-inside": [
					"auto",
					"avoid",
					"avoid-page",
					"avoid-column"
				] }],
				"box-decoration": [{ "box-decoration": ["slice", "clone"] }],
				box: [{ box: ["border", "content"] }],
				display: [
					"block",
					"inline-block",
					"inline",
					"flex",
					"inline-flex",
					"table",
					"inline-table",
					"table-caption",
					"table-cell",
					"table-column",
					"table-column-group",
					"table-footer-group",
					"table-header-group",
					"table-row-group",
					"table-row",
					"flow-root",
					"grid",
					"inline-grid",
					"contents",
					"list-item",
					"hidden"
				],
				sr: ["sr-only", "not-sr-only"],
				float: [{ float: [
					"right",
					"left",
					"none",
					"start",
					"end"
				] }],
				clear: [{ clear: [
					"left",
					"right",
					"both",
					"none",
					"start",
					"end"
				] }],
				isolation: ["isolate", "isolation-auto"],
				"object-fit": [{ object: [
					"contain",
					"cover",
					"fill",
					"none",
					"scale-down"
				] }],
				"object-position": [{ object: x() }],
				overflow: [{ overflow: S() }],
				"overflow-x": [{ "overflow-x": S() }],
				"overflow-y": [{ "overflow-y": S() }],
				overscroll: [{ overscroll: w() }],
				"overscroll-x": [{ "overscroll-x": w() }],
				"overscroll-y": [{ "overscroll-y": w() }],
				position: [
					"static",
					"fixed",
					"absolute",
					"relative",
					"sticky"
				],
				inset: [{ inset: E() }],
				"inset-x": [{ "inset-x": E() }],
				"inset-y": [{ "inset-y": E() }],
				start: [{ start: E() }],
				end: [{ end: E() }],
				top: [{ top: E() }],
				right: [{ right: E() }],
				bottom: [{ bottom: E() }],
				left: [{ left: E() }],
				visibility: [
					"visible",
					"invisible",
					"collapse"
				],
				z: [{ z: [
					M,
					"auto",
					V,
					z
				] }],
				basis: [{ basis: [
					A,
					"full",
					"auto",
					s,
					...T()
				] }],
				"flex-direction": [{ flex: [
					"row",
					"row-reverse",
					"col",
					"col-reverse"
				] }],
				"flex-wrap": [{ flex: [
					"nowrap",
					"wrap",
					"wrap-reverse"
				] }],
				flex: [{ flex: [
					j,
					A,
					"auto",
					"initial",
					"none",
					z
				] }],
				grow: [{ grow: [
					"",
					j,
					V,
					z
				] }],
				shrink: [{ shrink: [
					"",
					j,
					V,
					z
				] }],
				order: [{ order: [
					M,
					"first",
					"last",
					"none",
					V,
					z
				] }],
				"grid-cols": [{ "grid-cols": ee() }],
				"col-start-end": [{ col: D() }],
				"col-start": [{ "col-start": te() }],
				"col-end": [{ "col-end": te() }],
				"grid-rows": [{ "grid-rows": ee() }],
				"row-start-end": [{ row: D() }],
				"row-start": [{ "row-start": te() }],
				"row-end": [{ "row-end": te() }],
				"grid-flow": [{ "grid-flow": [
					"row",
					"col",
					"dense",
					"row-dense",
					"col-dense"
				] }],
				"auto-cols": [{ "auto-cols": O() }],
				"auto-rows": [{ "auto-rows": O() }],
				gap: [{ gap: T() }],
				"gap-x": [{ "gap-x": T() }],
				"gap-y": [{ "gap-y": T() }],
				"justify-content": [{ justify: [...k(), "normal"] }],
				"justify-items": [{ "justify-items": [...re(), "normal"] }],
				"justify-self": [{ "justify-self": ["auto", ...re()] }],
				"align-content": [{ content: ["normal", ...k()] }],
				"align-items": [{ items: [...re(), { baseline: ["", "last"] }] }],
				"align-self": [{ self: [
					"auto",
					...re(),
					{ baseline: ["", "last"] }
				] }],
				"place-content": [{ "place-content": k() }],
				"place-items": [{ "place-items": [...re(), "baseline"] }],
				"place-self": [{ "place-self": ["auto", ...re()] }],
				p: [{ p: T() }],
				px: [{ px: T() }],
				py: [{ py: T() }],
				ps: [{ ps: T() }],
				pe: [{ pe: T() }],
				pt: [{ pt: T() }],
				pr: [{ pr: T() }],
				pb: [{ pb: T() }],
				pl: [{ pl: T() }],
				m: [{ m: F() }],
				mx: [{ mx: F() }],
				my: [{ my: F() }],
				ms: [{ ms: F() }],
				me: [{ me: F() }],
				mt: [{ mt: F() }],
				mr: [{ mr: F() }],
				mb: [{ mb: F() }],
				ml: [{ ml: F() }],
				"space-x": [{ "space-x": T() }],
				"space-x-reverse": ["space-x-reverse"],
				"space-y": [{ "space-y": T() }],
				"space-y-reverse": ["space-y-reverse"],
				size: [{ size: I() }],
				w: [{ w: [
					s,
					"screen",
					...I()
				] }],
				"min-w": [{ "min-w": [
					s,
					"screen",
					"none",
					...I()
				] }],
				"max-w": [{ "max-w": [
					s,
					"screen",
					"none",
					"prose",
					{ screen: [o] },
					...I()
				] }],
				h: [{ h: [
					"screen",
					"lh",
					...I()
				] }],
				"min-h": [{ "min-h": [
					"screen",
					"lh",
					"none",
					...I()
				] }],
				"max-h": [{ "max-h": [
					"screen",
					"lh",
					...I()
				] }],
				"font-size": [{ text: [
					"base",
					n,
					H,
					ae
				] }],
				"font-smoothing": ["antialiased", "subpixel-antialiased"],
				"font-style": ["italic", "not-italic"],
				"font-weight": [{ font: [
					r,
					V,
					oe
				] }],
				"font-stretch": [{ "font-stretch": [
					"ultra-condensed",
					"extra-condensed",
					"condensed",
					"semi-condensed",
					"normal",
					"semi-expanded",
					"expanded",
					"extra-expanded",
					"ultra-expanded",
					N,
					z
				] }],
				"font-family": [{ font: [
					le,
					z,
					t
				] }],
				"fvn-normal": ["normal-nums"],
				"fvn-ordinal": ["ordinal"],
				"fvn-slashed-zero": ["slashed-zero"],
				"fvn-figure": ["lining-nums", "oldstyle-nums"],
				"fvn-spacing": ["proportional-nums", "tabular-nums"],
				"fvn-fraction": ["diagonal-fractions", "stacked-fractions"],
				tracking: [{ tracking: [
					i,
					V,
					z
				] }],
				"line-clamp": [{ "line-clamp": [
					j,
					"none",
					V,
					oe
				] }],
				leading: [{ leading: [a, ...T()] }],
				"list-image": [{ "list-image": [
					"none",
					V,
					z
				] }],
				"list-style-position": [{ list: ["inside", "outside"] }],
				"list-style-type": [{ list: [
					"disc",
					"decimal",
					"none",
					V,
					z
				] }],
				"text-alignment": [{ text: [
					"left",
					"center",
					"right",
					"justify",
					"start",
					"end"
				] }],
				"placeholder-color": [{ placeholder: L() }],
				"text-color": [{ text: L() }],
				"text-decoration": [
					"underline",
					"overline",
					"line-through",
					"no-underline"
				],
				"text-decoration-style": [{ decoration: [..._e(), "wavy"] }],
				"text-decoration-thickness": [{ decoration: [
					j,
					"from-font",
					"auto",
					V,
					ae
				] }],
				"text-decoration-color": [{ decoration: L() }],
				"underline-offset": [{ "underline-offset": [
					j,
					"auto",
					V,
					z
				] }],
				"text-transform": [
					"uppercase",
					"lowercase",
					"capitalize",
					"normal-case"
				],
				"text-overflow": [
					"truncate",
					"text-ellipsis",
					"text-clip"
				],
				"text-wrap": [{ text: [
					"wrap",
					"nowrap",
					"balance",
					"pretty"
				] }],
				indent: [{ indent: T() }],
				"vertical-align": [{ align: [
					"baseline",
					"top",
					"middle",
					"bottom",
					"text-top",
					"text-bottom",
					"sub",
					"super",
					V,
					z
				] }],
				whitespace: [{ whitespace: [
					"normal",
					"nowrap",
					"pre",
					"pre-line",
					"pre-wrap",
					"break-spaces"
				] }],
				break: [{ break: [
					"normal",
					"words",
					"all",
					"keep"
				] }],
				wrap: [{ wrap: [
					"break-word",
					"anywhere",
					"normal"
				] }],
				hyphens: [{ hyphens: [
					"none",
					"manual",
					"auto"
				] }],
				content: [{ content: [
					"none",
					V,
					z
				] }],
				"bg-attachment": [{ bg: [
					"fixed",
					"local",
					"scroll"
				] }],
				"bg-clip": [{ "bg-clip": [
					"border",
					"padding",
					"content",
					"text"
				] }],
				"bg-origin": [{ "bg-origin": [
					"border",
					"padding",
					"content"
				] }],
				"bg-position": [{ bg: pe() }],
				"bg-repeat": [{ bg: me() }],
				"bg-size": [{ bg: he() }],
				"bg-image": [{ bg: [
					"none",
					{
						linear: [
							{ to: [
								"t",
								"tr",
								"r",
								"br",
								"b",
								"bl",
								"l",
								"tl"
							] },
							M,
							V,
							z
						],
						radial: [
							"",
							V,
							z
						],
						conic: [
							M,
							V,
							z
						]
					},
					fe,
					ce
				] }],
				"bg-color": [{ bg: L() }],
				"gradient-from-pos": [{ from: ge() }],
				"gradient-via-pos": [{ via: ge() }],
				"gradient-to-pos": [{ to: ge() }],
				"gradient-from": [{ from: L() }],
				"gradient-via": [{ via: L() }],
				"gradient-to": [{ to: L() }],
				rounded: [{ rounded: W() }],
				"rounded-s": [{ "rounded-s": W() }],
				"rounded-e": [{ "rounded-e": W() }],
				"rounded-t": [{ "rounded-t": W() }],
				"rounded-r": [{ "rounded-r": W() }],
				"rounded-b": [{ "rounded-b": W() }],
				"rounded-l": [{ "rounded-l": W() }],
				"rounded-ss": [{ "rounded-ss": W() }],
				"rounded-se": [{ "rounded-se": W() }],
				"rounded-ee": [{ "rounded-ee": W() }],
				"rounded-es": [{ "rounded-es": W() }],
				"rounded-tl": [{ "rounded-tl": W() }],
				"rounded-tr": [{ "rounded-tr": W() }],
				"rounded-br": [{ "rounded-br": W() }],
				"rounded-bl": [{ "rounded-bl": W() }],
				"border-w": [{ border: G() }],
				"border-w-x": [{ "border-x": G() }],
				"border-w-y": [{ "border-y": G() }],
				"border-w-s": [{ "border-s": G() }],
				"border-w-e": [{ "border-e": G() }],
				"border-w-t": [{ "border-t": G() }],
				"border-w-r": [{ "border-r": G() }],
				"border-w-b": [{ "border-b": G() }],
				"border-w-l": [{ "border-l": G() }],
				"divide-x": [{ "divide-x": G() }],
				"divide-x-reverse": ["divide-x-reverse"],
				"divide-y": [{ "divide-y": G() }],
				"divide-y-reverse": ["divide-y-reverse"],
				"border-style": [{ border: [
					..._e(),
					"hidden",
					"none"
				] }],
				"divide-style": [{ divide: [
					..._e(),
					"hidden",
					"none"
				] }],
				"border-color": [{ border: L() }],
				"border-color-x": [{ "border-x": L() }],
				"border-color-y": [{ "border-y": L() }],
				"border-color-s": [{ "border-s": L() }],
				"border-color-e": [{ "border-e": L() }],
				"border-color-t": [{ "border-t": L() }],
				"border-color-r": [{ "border-r": L() }],
				"border-color-b": [{ "border-b": L() }],
				"border-color-l": [{ "border-l": L() }],
				"divide-color": [{ divide: L() }],
				"outline-style": [{ outline: [
					..._e(),
					"none",
					"hidden"
				] }],
				"outline-offset": [{ "outline-offset": [
					j,
					V,
					z
				] }],
				"outline-w": [{ outline: [
					"",
					j,
					H,
					ae
				] }],
				"outline-color": [{ outline: L() }],
				shadow: [{ shadow: [
					"",
					"none",
					u,
					U,
					B
				] }],
				"shadow-color": [{ shadow: L() }],
				"inset-shadow": [{ "inset-shadow": [
					"none",
					d,
					U,
					B
				] }],
				"inset-shadow-color": [{ "inset-shadow": L() }],
				"ring-w": [{ ring: G() }],
				"ring-w-inset": ["ring-inset"],
				"ring-color": [{ ring: L() }],
				"ring-offset-w": [{ "ring-offset": [j, ae] }],
				"ring-offset-color": [{ "ring-offset": L() }],
				"inset-ring-w": [{ "inset-ring": G() }],
				"inset-ring-color": [{ "inset-ring": L() }],
				"text-shadow": [{ "text-shadow": [
					"none",
					f,
					U,
					B
				] }],
				"text-shadow-color": [{ "text-shadow": L() }],
				opacity: [{ opacity: [
					j,
					V,
					z
				] }],
				"mix-blend": [{ "mix-blend": [
					...K(),
					"plus-darker",
					"plus-lighter"
				] }],
				"bg-blend": [{ "bg-blend": K() }],
				"mask-clip": [{ "mask-clip": [
					"border",
					"padding",
					"content",
					"fill",
					"stroke",
					"view"
				] }, "mask-no-clip"],
				"mask-composite": [{ mask: [
					"add",
					"subtract",
					"intersect",
					"exclude"
				] }],
				"mask-image-linear-pos": [{ "mask-linear": [j] }],
				"mask-image-linear-from-pos": [{ "mask-linear-from": q() }],
				"mask-image-linear-to-pos": [{ "mask-linear-to": q() }],
				"mask-image-linear-from-color": [{ "mask-linear-from": L() }],
				"mask-image-linear-to-color": [{ "mask-linear-to": L() }],
				"mask-image-t-from-pos": [{ "mask-t-from": q() }],
				"mask-image-t-to-pos": [{ "mask-t-to": q() }],
				"mask-image-t-from-color": [{ "mask-t-from": L() }],
				"mask-image-t-to-color": [{ "mask-t-to": L() }],
				"mask-image-r-from-pos": [{ "mask-r-from": q() }],
				"mask-image-r-to-pos": [{ "mask-r-to": q() }],
				"mask-image-r-from-color": [{ "mask-r-from": L() }],
				"mask-image-r-to-color": [{ "mask-r-to": L() }],
				"mask-image-b-from-pos": [{ "mask-b-from": q() }],
				"mask-image-b-to-pos": [{ "mask-b-to": q() }],
				"mask-image-b-from-color": [{ "mask-b-from": L() }],
				"mask-image-b-to-color": [{ "mask-b-to": L() }],
				"mask-image-l-from-pos": [{ "mask-l-from": q() }],
				"mask-image-l-to-pos": [{ "mask-l-to": q() }],
				"mask-image-l-from-color": [{ "mask-l-from": L() }],
				"mask-image-l-to-color": [{ "mask-l-to": L() }],
				"mask-image-x-from-pos": [{ "mask-x-from": q() }],
				"mask-image-x-to-pos": [{ "mask-x-to": q() }],
				"mask-image-x-from-color": [{ "mask-x-from": L() }],
				"mask-image-x-to-color": [{ "mask-x-to": L() }],
				"mask-image-y-from-pos": [{ "mask-y-from": q() }],
				"mask-image-y-to-pos": [{ "mask-y-to": q() }],
				"mask-image-y-from-color": [{ "mask-y-from": L() }],
				"mask-image-y-to-color": [{ "mask-y-to": L() }],
				"mask-image-radial": [{ "mask-radial": [V, z] }],
				"mask-image-radial-from-pos": [{ "mask-radial-from": q() }],
				"mask-image-radial-to-pos": [{ "mask-radial-to": q() }],
				"mask-image-radial-from-color": [{ "mask-radial-from": L() }],
				"mask-image-radial-to-color": [{ "mask-radial-to": L() }],
				"mask-image-radial-shape": [{ "mask-radial": ["circle", "ellipse"] }],
				"mask-image-radial-size": [{ "mask-radial": [{
					closest: ["side", "corner"],
					farthest: ["side", "corner"]
				}] }],
				"mask-image-radial-pos": [{ "mask-radial-at": b() }],
				"mask-image-conic-pos": [{ "mask-conic": [j] }],
				"mask-image-conic-from-pos": [{ "mask-conic-from": q() }],
				"mask-image-conic-to-pos": [{ "mask-conic-to": q() }],
				"mask-image-conic-from-color": [{ "mask-conic-from": L() }],
				"mask-image-conic-to-color": [{ "mask-conic-to": L() }],
				"mask-mode": [{ mask: [
					"alpha",
					"luminance",
					"match"
				] }],
				"mask-origin": [{ "mask-origin": [
					"border",
					"padding",
					"content",
					"fill",
					"stroke",
					"view"
				] }],
				"mask-position": [{ mask: pe() }],
				"mask-repeat": [{ mask: me() }],
				"mask-size": [{ mask: he() }],
				"mask-type": [{ "mask-type": ["alpha", "luminance"] }],
				"mask-image": [{ mask: [
					"none",
					V,
					z
				] }],
				filter: [{ filter: [
					"",
					"none",
					V,
					z
				] }],
				blur: [{ blur: ve() }],
				brightness: [{ brightness: [
					j,
					V,
					z
				] }],
				contrast: [{ contrast: [
					j,
					V,
					z
				] }],
				"drop-shadow": [{ "drop-shadow": [
					"",
					"none",
					p,
					U,
					B
				] }],
				"drop-shadow-color": [{ "drop-shadow": L() }],
				grayscale: [{ grayscale: [
					"",
					j,
					V,
					z
				] }],
				"hue-rotate": [{ "hue-rotate": [
					j,
					V,
					z
				] }],
				invert: [{ invert: [
					"",
					j,
					V,
					z
				] }],
				saturate: [{ saturate: [
					j,
					V,
					z
				] }],
				sepia: [{ sepia: [
					"",
					j,
					V,
					z
				] }],
				"backdrop-filter": [{ "backdrop-filter": [
					"",
					"none",
					V,
					z
				] }],
				"backdrop-blur": [{ "backdrop-blur": ve() }],
				"backdrop-brightness": [{ "backdrop-brightness": [
					j,
					V,
					z
				] }],
				"backdrop-contrast": [{ "backdrop-contrast": [
					j,
					V,
					z
				] }],
				"backdrop-grayscale": [{ "backdrop-grayscale": [
					"",
					j,
					V,
					z
				] }],
				"backdrop-hue-rotate": [{ "backdrop-hue-rotate": [
					j,
					V,
					z
				] }],
				"backdrop-invert": [{ "backdrop-invert": [
					"",
					j,
					V,
					z
				] }],
				"backdrop-opacity": [{ "backdrop-opacity": [
					j,
					V,
					z
				] }],
				"backdrop-saturate": [{ "backdrop-saturate": [
					j,
					V,
					z
				] }],
				"backdrop-sepia": [{ "backdrop-sepia": [
					"",
					j,
					V,
					z
				] }],
				"border-collapse": [{ border: ["collapse", "separate"] }],
				"border-spacing": [{ "border-spacing": T() }],
				"border-spacing-x": [{ "border-spacing-x": T() }],
				"border-spacing-y": [{ "border-spacing-y": T() }],
				"table-layout": [{ table: ["auto", "fixed"] }],
				caption: [{ caption: ["top", "bottom"] }],
				transition: [{ transition: [
					"",
					"all",
					"colors",
					"opacity",
					"shadow",
					"transform",
					"none",
					V,
					z
				] }],
				"transition-behavior": [{ transition: ["normal", "discrete"] }],
				duration: [{ duration: [
					j,
					"initial",
					V,
					z
				] }],
				ease: [{ ease: [
					"linear",
					"initial",
					_,
					V,
					z
				] }],
				delay: [{ delay: [
					j,
					V,
					z
				] }],
				animate: [{ animate: [
					"none",
					v,
					V,
					z
				] }],
				backface: [{ backface: ["hidden", "visible"] }],
				perspective: [{ perspective: [
					h,
					V,
					z
				] }],
				"perspective-origin": [{ "perspective-origin": x() }],
				rotate: [{ rotate: ye() }],
				"rotate-x": [{ "rotate-x": ye() }],
				"rotate-y": [{ "rotate-y": ye() }],
				"rotate-z": [{ "rotate-z": ye() }],
				scale: [{ scale: be() }],
				"scale-x": [{ "scale-x": be() }],
				"scale-y": [{ "scale-y": be() }],
				"scale-z": [{ "scale-z": be() }],
				"scale-3d": ["scale-3d"],
				skew: [{ skew: xe() }],
				"skew-x": [{ "skew-x": xe() }],
				"skew-y": [{ "skew-y": xe() }],
				transform: [{ transform: [
					V,
					z,
					"",
					"none",
					"gpu",
					"cpu"
				] }],
				"transform-origin": [{ origin: x() }],
				"transform-style": [{ transform: ["3d", "flat"] }],
				translate: [{ translate: Se() }],
				"translate-x": [{ "translate-x": Se() }],
				"translate-y": [{ "translate-y": Se() }],
				"translate-z": [{ "translate-z": Se() }],
				"translate-none": ["translate-none"],
				accent: [{ accent: L() }],
				appearance: [{ appearance: ["none", "auto"] }],
				"caret-color": [{ caret: L() }],
				"color-scheme": [{ scheme: [
					"normal",
					"dark",
					"light",
					"light-dark",
					"only-dark",
					"only-light"
				] }],
				cursor: [{ cursor: [
					"auto",
					"default",
					"pointer",
					"wait",
					"text",
					"move",
					"help",
					"not-allowed",
					"none",
					"context-menu",
					"progress",
					"cell",
					"crosshair",
					"vertical-text",
					"alias",
					"copy",
					"no-drop",
					"grab",
					"grabbing",
					"all-scroll",
					"col-resize",
					"row-resize",
					"n-resize",
					"e-resize",
					"s-resize",
					"w-resize",
					"ne-resize",
					"nw-resize",
					"se-resize",
					"sw-resize",
					"ew-resize",
					"ns-resize",
					"nesw-resize",
					"nwse-resize",
					"zoom-in",
					"zoom-out",
					V,
					z
				] }],
				"field-sizing": [{ "field-sizing": ["fixed", "content"] }],
				"pointer-events": [{ "pointer-events": ["auto", "none"] }],
				resize: [{ resize: [
					"none",
					"",
					"y",
					"x"
				] }],
				"scroll-behavior": [{ scroll: ["auto", "smooth"] }],
				"scroll-m": [{ "scroll-m": T() }],
				"scroll-mx": [{ "scroll-mx": T() }],
				"scroll-my": [{ "scroll-my": T() }],
				"scroll-ms": [{ "scroll-ms": T() }],
				"scroll-me": [{ "scroll-me": T() }],
				"scroll-mt": [{ "scroll-mt": T() }],
				"scroll-mr": [{ "scroll-mr": T() }],
				"scroll-mb": [{ "scroll-mb": T() }],
				"scroll-ml": [{ "scroll-ml": T() }],
				"scroll-p": [{ "scroll-p": T() }],
				"scroll-px": [{ "scroll-px": T() }],
				"scroll-py": [{ "scroll-py": T() }],
				"scroll-ps": [{ "scroll-ps": T() }],
				"scroll-pe": [{ "scroll-pe": T() }],
				"scroll-pt": [{ "scroll-pt": T() }],
				"scroll-pr": [{ "scroll-pr": T() }],
				"scroll-pb": [{ "scroll-pb": T() }],
				"scroll-pl": [{ "scroll-pl": T() }],
				"snap-align": [{ snap: [
					"start",
					"end",
					"center",
					"align-none"
				] }],
				"snap-stop": [{ snap: ["normal", "always"] }],
				"snap-type": [{ snap: [
					"none",
					"x",
					"y",
					"both"
				] }],
				"snap-strictness": [{ snap: ["mandatory", "proximity"] }],
				touch: [{ touch: [
					"auto",
					"none",
					"manipulation"
				] }],
				"touch-x": [{ "touch-pan": [
					"x",
					"left",
					"right"
				] }],
				"touch-y": [{ "touch-pan": [
					"y",
					"up",
					"down"
				] }],
				"touch-pz": ["touch-pinch-zoom"],
				select: [{ select: [
					"none",
					"text",
					"all",
					"auto"
				] }],
				"will-change": [{ "will-change": [
					"auto",
					"scroll",
					"contents",
					"transform",
					V,
					z
				] }],
				fill: [{ fill: ["none", ...L()] }],
				"stroke-w": [{ stroke: [
					j,
					H,
					ae,
					oe
				] }],
				stroke: [{ stroke: ["none", ...L()] }],
				"forced-color-adjust": [{ "forced-color-adjust": ["auto", "none"] }]
			},
			conflictingClassGroups: {
				overflow: ["overflow-x", "overflow-y"],
				overscroll: ["overscroll-x", "overscroll-y"],
				inset: [
					"inset-x",
					"inset-y",
					"start",
					"end",
					"top",
					"right",
					"bottom",
					"left"
				],
				"inset-x": ["right", "left"],
				"inset-y": ["top", "bottom"],
				flex: [
					"basis",
					"grow",
					"shrink"
				],
				gap: ["gap-x", "gap-y"],
				p: [
					"px",
					"py",
					"ps",
					"pe",
					"pt",
					"pr",
					"pb",
					"pl"
				],
				px: ["pr", "pl"],
				py: ["pt", "pb"],
				m: [
					"mx",
					"my",
					"ms",
					"me",
					"mt",
					"mr",
					"mb",
					"ml"
				],
				mx: ["mr", "ml"],
				my: ["mt", "mb"],
				size: ["w", "h"],
				"font-size": ["leading"],
				"fvn-normal": [
					"fvn-ordinal",
					"fvn-slashed-zero",
					"fvn-figure",
					"fvn-spacing",
					"fvn-fraction"
				],
				"fvn-ordinal": ["fvn-normal"],
				"fvn-slashed-zero": ["fvn-normal"],
				"fvn-figure": ["fvn-normal"],
				"fvn-spacing": ["fvn-normal"],
				"fvn-fraction": ["fvn-normal"],
				"line-clamp": ["display", "overflow"],
				rounded: [
					"rounded-s",
					"rounded-e",
					"rounded-t",
					"rounded-r",
					"rounded-b",
					"rounded-l",
					"rounded-ss",
					"rounded-se",
					"rounded-ee",
					"rounded-es",
					"rounded-tl",
					"rounded-tr",
					"rounded-br",
					"rounded-bl"
				],
				"rounded-s": ["rounded-ss", "rounded-es"],
				"rounded-e": ["rounded-se", "rounded-ee"],
				"rounded-t": ["rounded-tl", "rounded-tr"],
				"rounded-r": ["rounded-tr", "rounded-br"],
				"rounded-b": ["rounded-br", "rounded-bl"],
				"rounded-l": ["rounded-tl", "rounded-bl"],
				"border-spacing": ["border-spacing-x", "border-spacing-y"],
				"border-w": [
					"border-w-x",
					"border-w-y",
					"border-w-s",
					"border-w-e",
					"border-w-t",
					"border-w-r",
					"border-w-b",
					"border-w-l"
				],
				"border-w-x": ["border-w-r", "border-w-l"],
				"border-w-y": ["border-w-t", "border-w-b"],
				"border-color": [
					"border-color-x",
					"border-color-y",
					"border-color-s",
					"border-color-e",
					"border-color-t",
					"border-color-r",
					"border-color-b",
					"border-color-l"
				],
				"border-color-x": ["border-color-r", "border-color-l"],
				"border-color-y": ["border-color-t", "border-color-b"],
				translate: [
					"translate-x",
					"translate-y",
					"translate-none"
				],
				"translate-none": [
					"translate",
					"translate-x",
					"translate-y",
					"translate-z"
				],
				"scroll-m": [
					"scroll-mx",
					"scroll-my",
					"scroll-ms",
					"scroll-me",
					"scroll-mt",
					"scroll-mr",
					"scroll-mb",
					"scroll-ml"
				],
				"scroll-mx": ["scroll-mr", "scroll-ml"],
				"scroll-my": ["scroll-mt", "scroll-mb"],
				"scroll-p": [
					"scroll-px",
					"scroll-py",
					"scroll-ps",
					"scroll-pe",
					"scroll-pt",
					"scroll-pr",
					"scroll-pb",
					"scroll-pl"
				],
				"scroll-px": ["scroll-pr", "scroll-pl"],
				"scroll-py": ["scroll-pt", "scroll-pb"],
				touch: [
					"touch-x",
					"touch-y",
					"touch-pz"
				],
				"touch-x": ["touch"],
				"touch-y": ["touch"],
				"touch-pz": ["touch"]
			},
			conflictingClassGroupModifiers: { "font-size": ["leading"] },
			orderSensitiveModifiers: [
				"*",
				"**",
				"after",
				"backdrop",
				"before",
				"details-content",
				"file",
				"first-letter",
				"first-line",
				"marker",
				"placeholder",
				"selection"
			]
		};
	}, be = (e, { cacheSize: t, prefix: n, experimentalParseClassName: r, extend: i = {}, override: a = {} }) => (xe(e, "cacheSize", t), xe(e, "prefix", n), xe(e, "experimentalParseClassName", r), Se(e.theme, a.theme), Se(e.classGroups, a.classGroups), Se(e.conflictingClassGroups, a.conflictingClassGroups), Se(e.conflictingClassGroupModifiers, a.conflictingClassGroupModifiers), xe(e, "orderSensitiveModifiers", a.orderSensitiveModifiers), Ce(e.theme, i.theme), Ce(e.classGroups, i.classGroups), Ce(e.conflictingClassGroups, i.conflictingClassGroups), Ce(e.conflictingClassGroupModifiers, i.conflictingClassGroupModifiers), we(e, i, "orderSensitiveModifiers"), e), xe = (e, t, n) => {
		n !== void 0 && (e[t] = n);
	}, Se = (e, t) => {
		if (t) for (let n in t) xe(e, n, t[n]);
	}, Ce = (e, t) => {
		if (t) for (let n in t) we(e, t, n);
	}, we = (e, t, n) => {
		let r = t[n];
		r !== void 0 && (e[n] = e[n] ? e[n].concat(r) : r);
	}, Te = (e, ...t) => typeof e == "function" ? S(ye, e, ...t) : S(() => be(ye(), e), ...t), Ee = /*#__PURE__*/ S(ye);
	e.createTailwindMerge = S, e.extendTailwindMerge = Te, e.fromTheme = C, e.getDefaultConfig = ye, e.mergeConfigs = be, e.twJoin = b, e.twMerge = Ee, e.validators = ve;
})))();
function qy(...e) {
	return (0, Ky.twMerge)(Gy(e));
}
// ../shared-node/src/components/ui/interactionSkin.js
var Jy = "rounded-md", Yy = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-intent))] focus-visible:ring-offset-2 focus-visible:ring-offset-background", Xy = "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 data-[disabled]:pointer-events-none data-[disabled]:opacity-50", Zy = "transition-[color,background-color,border-color,box-shadow,transform] duration-300 ease-out-expo", Qy = "active:translate-y-px active:scale-[0.985] motion-reduce:active:translate-y-0 motion-reduce:active:scale-100", $y = "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";
[
	"inline-flex select-none items-center justify-center gap-2 whitespace-nowrap",
	Jy,
	"text-sm font-medium",
	$y,
	Yy,
	Xy,
	Zy,
	Qy
].join(" "), [
	"flex w-full",
	Jy,
	"border border-[hsl(var(--glass-edge))]/20 bg-[hsl(var(--layer-state))] px-3 py-2 text-sm",
	"text-[hsl(var(--fg-intent))] placeholder:text-[hsl(var(--fg-orientation))]",
	"caret-[hsl(var(--color-intent))] selection:bg-[hsl(var(--color-intent))]/30",
	"hover:border-[hsl(var(--glass-edge))]/35",
	"focus-visible:border-[hsl(var(--color-intent))]/60",
	"[aria-invalid=\"true\"]:border-[hsl(var(--color-error))] [aria-invalid=\"true\"]:ring-2 [aria-invalid=\"true\"]:ring-[hsl(var(--color-error))]/25",
	"read-only:text-[hsl(var(--fg-orientation))] read-only:bg-transparent",
	Yy,
	Xy,
	Zy
].join(" ");
var eb = [
	"z-popover overflow-hidden",
	Jy,
	"border border-[hsl(var(--glass-edge))]/15",
	"bg-[hsl(var(--surface-overlay))] text-[hsl(var(--fg-state))]",
	"shadow-[var(--projection-float)]"
].join(" "), tb = "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2", nb = [
	"relative flex cursor-default select-none items-center gap-2",
	"rounded-sm px-2 py-1.5 text-sm outline-none",
	"transition-colors duration-200 ease-out-expo",
	"focus:bg-[hsl(var(--layer-intent))] focus:text-[hsl(var(--fg-intent))]",
	Xy,
	$y
].join(" "), rb = nb.replace("px-2 py-1.5", "py-1.5 pl-8 pr-2"), ib = "px-2 py-1.5 text-xs font-medium text-[hsl(var(--fg-orientation))]", ab = "-mx-1 my-1 h-px bg-[hsl(var(--glass-edge))]/10";
[
	"z-modal grid w-full max-w-lg gap-4",
	Jy,
	"border border-[hsl(var(--glass-edge))]/15",
	"bg-[hsl(var(--surface-overlay))] p-6 text-[hsl(var(--fg-state))]",
	"shadow-[var(--projection-float)]"
].join(" ");
// ../shared-node/src/components/ui/context-menu.jsx
var ob = My, sb = Ny, cb = e.forwardRef(({ className: e, inset: t, children: n, ...r }, i) => /* @__PURE__ */ y(Hy, {
	ref: i,
	className: qy(nb, "data-[state=open]:bg-[hsl(var(--layer-intent))]", t && "pl-8", e),
	...r,
	children: [n, /* @__PURE__ */ v(ql, { className: "ml-auto h-4 w-4" })]
}));
cb.displayName = Hy.displayName;
var lb = e.forwardRef(({ className: e, ...t }, n) => /* @__PURE__ */ v(Uy, {
	ref: n,
	className: qy(eb, "min-w-[8rem] p-1", tb, e),
	...t
}));
lb.displayName = Uy.displayName;
var ub = e.forwardRef(({ className: e, ...t }, n) => /* @__PURE__ */ v(Py, { children: /* @__PURE__ */ v(Fy, {
	ref: n,
	className: qy(eb, "min-w-[8rem] p-1", tb, e),
	...t
}) }));
ub.displayName = Fy.displayName;
var db = e.forwardRef(({ className: e, inset: t, ...n }, r) => /* @__PURE__ */ v(Ly, {
	ref: r,
	className: qy(nb, t && "pl-8", e),
	...n
}));
db.displayName = Ly.displayName;
var fb = e.forwardRef(({ className: e, children: t, checked: n, ...r }, i) => /* @__PURE__ */ y(Ry, {
	ref: i,
	className: qy(rb, e),
	checked: n,
	...r,
	children: [/* @__PURE__ */ v("span", {
		className: "absolute left-2 flex h-3.5 w-3.5 items-center justify-center",
		children: /* @__PURE__ */ v(By, { children: /* @__PURE__ */ v(Kl, { className: "h-4 w-4" }) })
	}), t]
}));
fb.displayName = Ry.displayName;
var pb = e.forwardRef(({ className: e, children: t, ...n }, r) => /* @__PURE__ */ y(zy, {
	ref: r,
	className: qy(rb, e),
	...n,
	children: [/* @__PURE__ */ v("span", {
		className: "absolute left-2 flex h-3.5 w-3.5 items-center justify-center",
		children: /* @__PURE__ */ v(By, { children: /* @__PURE__ */ v(Jl, { className: "h-2 w-2 fill-current" }) })
	}), t]
}));
pb.displayName = zy.displayName;
var mb = e.forwardRef(({ className: e, inset: t, ...n }, r) => /* @__PURE__ */ v(Iy, {
	ref: r,
	className: qy(ib, t && "pl-8", e),
	...n
}));
mb.displayName = Iy.displayName;
var hb = e.forwardRef(({ className: e, ...t }, n) => /* @__PURE__ */ v(Vy, {
	ref: n,
	className: qy(ab, e),
	...t
}));
hb.displayName = Vy.displayName;
// ../shared-node/src/lib/utils.js
function gb(...e) {
	return (0, Ky.twMerge)(Gy(e));
}
window.self, window.top;
// ../shared-node/src/lib/windowFrameDragRecord.mjs
function _b({ from: e, ticks: t } = {}) {
	return !!e && (Number.isFinite(t) ? Math.floor(t) : 0) > 0;
}
function vb({ title: e, appId: t, ticks: n, first: r, last: i, unit: a = "pointer tick" } = {}) {
	return _b({
		from: r,
		ticks: n
	}) ? {
		kind: "semantic",
		source: "window",
		label: e || t || "Window",
		subject_ref: t || null,
		ticks: Math.floor(n),
		first: {
			x: r.x,
			y: r.y
		},
		last: {
			x: i.x,
			y: i.y
		},
		unit: a
	} : null;
}
// ../shared-node/src/components/ui/ChromePrimitives.jsx
var yb = {
	bar: "w-4 h-4",
	taskbar: "w-5 h-5"
}, bb = {
	frameStep: .005,
	parallaxSmoothing: .02,
	ambientRate: .5,
	assumedFps: 60
};
1 / (bb.parallaxSmoothing * bb.assumedFps), 2 * Math.PI / (bb.ambientRate * bb.frameStep * bb.assumedFps), [
	"255, 248, 232",
	"255, 214, 150",
	"255, 170, 70",
	"255, 120, 32",
	"210, 72, 16",
	"160, 44, 8",
	"160, 44, 8"
].map((e) => e.split(",").map(Number));
var xb = {
	brand: 168,
	red: 0,
	orange: 25,
	amber: 38,
	yellow: 48,
	lime: 82,
	green: 140,
	emerald: 160,
	teal: 172,
	cyan: 188,
	sky: 200,
	blue: 218,
	indigo: 245,
	violet: 262,
	purple: 275,
	fuchsia: 292,
	pink: 330,
	rose: 350
}, Sb = (e, t, n) => {
	t /= 100, n /= 100;
	let r = (t) => (t + e / 30) % 12, i = t * Math.min(n, 1 - n), a = (e) => n - i * Math.max(-1, Math.min(r(e) - 3, Math.min(9 - r(e), 1)));
	return [
		Math.round(a(0) * 255),
		Math.round(a(8) * 255),
		Math.round(a(4) * 255)
	];
}, Cb = (e) => {
	let t = String(e || "").split("-")[0];
	return Object.prototype.hasOwnProperty.call(xb, t) ? xb[t] : null;
}, wb = (e, t = .45) => {
	let n = Cb(e), [r, i, a] = n == null ? [
		148,
		148,
		152
	] : Sb(n, 74, 60);
	return `rgba(${r}, ${i}, ${a}, ${t})`;
};
typeof performance < "u" && performance.now(), Object.freeze([
	Object.freeze({
		id: "shadow",
		says: "where the light did not reach"
	}),
	Object.freeze({
		id: "gloss",
		says: "where the light lands first"
	}),
	Object.freeze({
		id: "reflection",
		says: "the colour the surface gives back"
	})
]);
var Tb = "xi-chroma", Eb = "xi-chroma-lit";
function Db(e) {
	return Cb(e) != null;
}
function Ob(e) {
	return Cb(e) ?? 168;
}
function kb(e, t = "") {
	return [
		Tb,
		Db(e) ? Eb : "",
		t
	].filter(Boolean).join(" ");
}
function Ab(e, t) {
	return {
		"--chroma-hue": String(Ob(e)),
		...t || {}
	};
}
// ../shared-node/src/lib/desktopSnap.mjs
var jb = (e, t) => e === t || !!e && !!t && e.axis === t.axis && e.at === t.at && e.from === t.from && e.to === t.to;
// ../shared-node/src/lib/resizeObserver.js
function Mb(e, t) {
	if (!e || typeof ResizeObserver > "u") return () => {};
	let n = 0, r = new ResizeObserver(() => {
		n ||= requestAnimationFrame(() => {
			n = 0, t();
		});
	});
	return r.observe(e), () => {
		n && cancelAnimationFrame(n), r.disconnect();
	};
}
Object.freeze({
	DESKTOP: "COLUMN_OR_WINDOW",
	MOBILE: "OVERLAY"
}), Object.freeze({
	WORK: "Z0_WORK",
	CONTEXT: "Z1_CONTEXT",
	TOOLS: "Z2_TOOLS_SETTINGS",
	LOOKING_GLASS: "Z3_LOOKING_GLASS",
	FORECAST: "Z4_FORECAST",
	TRANSIENT: "Z5_TRANSIENT"
}), Object.freeze({
	sm: {
		w: 256,
		h: 128
	},
	md: {
		w: 320,
		h: 256
	},
	lg: {
		w: 384,
		h: 384
	},
	xl: {
		w: 500,
		h: 400
	}
});
var Nb = Object.freeze({
	w: 1e3,
	h: 700
});
Object.freeze([
	"that the desk status rail has been observed on screen as a pane — the reading is owed",
	"that every shell fixture has been classified as a pane or as furniture",
	"that a chat window joins the drawer on a phone — there is no field to join against there"
]);
// ../shared-node/src/lib/desktopAccess.mjs
function Pb(e, t) {
	let n = Number(t?.width), r = Number(t?.height);
	if (!Number.isFinite(n) || !Number.isFinite(r) || n <= 0 || r <= 0) return {
		x: e.x,
		y: e.y,
		clamped: !1
	};
	let i = Math.max(0, n - e.w), a = Math.max(0, r - e.h), o = Math.min(Math.max(e.x, 0), i), s = Math.min(Math.max(e.y, 0), a);
	return {
		x: o,
		y: s,
		clamped: o !== e.x || s !== e.y
	};
}
function Fb(e, t, { minW: n = 280, minH: r = 200 } = {}) {
	let i = Number(t?.width), a = Number(t?.height), o = Number(e?.width), s = Number(e?.height);
	if (!Number.isFinite(i) || !Number.isFinite(a) || i <= 0 || a <= 0 || !Number.isFinite(o) || !Number.isFinite(s) || o <= 0 || s <= 0) return {
		width: o,
		height: s,
		fitted: !1
	};
	let c = Math.min(n, i), l = Math.min(r, a), u = Math.min(Math.max(c, o), i), d = Math.min(Math.max(l, s), a);
	return {
		width: u,
		height: d,
		fitted: u !== o || d !== s
	};
}
function Ib(e, t) {
	return !e || !t || ![
		e.left,
		e.top,
		e.width,
		e.height,
		t.left,
		t.top,
		t.width,
		t.height
	].every(Number.isFinite) || e.width <= 0 || e.height <= 0 || t.width <= 0 || t.height <= 0 || !(t.left < e.left + e.width && t.left + t.width > e.left) || t.top > e.top ? 0 : Math.max(0, Math.min(e.height, t.top + t.height - e.top));
}
function Lb(e, t, { top: n = 0, bottom: r = 0 } = {}, { minW: i = 400, minH: a = 300 } = {}) {
	let o = Number(t?.width), s = Number(t?.height);
	if (!(Number.isFinite(o) && o > 0 && Number.isFinite(s) && s > 0)) return e;
	let c = Math.max(0, Math.min(s, Number(n) || 0)), l = Math.max(0, Math.min(s - c, Number(r) || 0)), u = {
		width: o,
		height: Math.max(1, s - c - l)
	}, d = Fb({
		width: e.w,
		height: e.h
	}, u, {
		minW: i,
		minH: a
	}), f = Pb({
		x: e.x,
		y: e.y - c,
		w: d.width,
		h: d.height
	}, u);
	return {
		x: f.x,
		y: f.y + c,
		w: d.width,
		h: d.height
	};
}
function Rb(e, t, n, r, i = {}, { minW: a = 400, minH: o = 300 } = {}) {
	let s = Lb(e, r, i, {
		minW: a,
		minH: o
	}), c = Number(r?.width), l = Number(r?.height), u = Number.isFinite(c) && c > 0 && Number.isFinite(l) && l > 0, d = u ? Math.max(0, Math.min(l, Number(i.top) || 0)) : 0, f = u ? Math.max(d + 1, l - Math.max(0, Number(i.bottom) || 0)) : Infinity, p = u ? Math.min(a, c) : a, m = u ? Math.min(o, f - d) : o, h = s.x, g = s.x + s.w, _ = s.y, v = s.y + s.h, y = Number(t.dx) || 0, b = Number(t.dy) || 0, x = (e, t, n) => Math.max(t, Math.min(n, e));
	return n.left && (h = x(h + y, 0, g - p)), n.right && (g = x(g + y, h + p, u ? c : Infinity)), n.top && (_ = x(_ + b, d, v - m)), n.bottom && (v = x(v + b, _ + m, f)), {
		x: h,
		y: _,
		w: g - h,
		h: v - _
	};
}
Object.freeze([
	"that every shell fixture has been classified as a panel or as furniture",
	"that a covered icon has been observed on screen — the reading is owed",
	"that a panel can never be moved by a keyboard shortcut outside this clamp"
]);
// ../shared-node/src/lib/tabletCompose.mjs
var zb = "application/x-xiio-tablet-compose", Bb = /* @__PURE__ */ new Map(), Vb = /* @__PURE__ */ new Set(), Hb = null, Ub = /* @__PURE__ */ new Set(), Wb = Object.freeze({
	open: !1,
	sources: Object.freeze([]),
	stamped_at: null
});
function Gb() {
	Vb.forEach((e) => e());
}
function Kb() {
	try {
		return (/* @__PURE__ */ new Date()).toLocaleString("en-CA", { timeZone: "America/Regina" });
	} catch {
		return (/* @__PURE__ */ new Date()).toISOString();
	}
}
function qb(e) {
	return e && Bb.get(e) || Wb;
}
function Jb(e) {
	return Vb.add(e), () => Vb.delete(e);
}
function Yb(e) {
	return g(Jb, () => qb(e), () => Wb);
}
function Xb(e) {
	return Ub.add(e), () => Ub.delete(e);
}
function Zb(e) {
	return g(Xb, () => !!e && Hb === e, () => !1);
}
function Qb(e, t) {
	if (!e) return {
		ok: !1,
		reason: "NO_WINDOW"
	};
	if (!t || !t.kind || !t.id) return {
		ok: !1,
		reason: "NO_SOURCE"
	};
	let n = qb(e), r = $b(t), i = [...n.sources.filter((e) => e.kind !== r.kind || e.id !== r.id), r];
	return Bb.set(e, {
		open: !0,
		sources: i,
		stamped_at: Kb()
	}), Gb(), typeof window < "u" && window.dispatchEvent(new CustomEvent("xiio:tablet-compose", { detail: {
		windowId: e,
		source: r,
		open: !0
	} })), {
		ok: !0,
		windowId: e,
		sources: i
	};
}
function $b(e) {
	let t = Array.isArray(e.tools) && e.tools.length ? e.tools : ex(e);
	return {
		kind: e.kind,
		id: String(e.id),
		title: e.title || e.name || e.id,
		appId: e.appId || null,
		path: e.path || null,
		name: e.name || e.title || null,
		tools: t
	};
}
function ex(e) {
	return e.kind === "file" ? [
		"FileExplorer",
		"Preview",
		"Attach"
	] : e.appId === "Legal" || e.appId === "document" || e.appId === "OfficeSuite" ? [
		"FileExplorer",
		"DraftTools",
		"Placeholders",
		"Styles"
	] : e.kind === "widget" || e.kind === "pin" ? [
		"FileExplorer",
		"WidgetSettings",
		"ProjectTools"
	] : ["FileExplorer", "Tools"];
}
function tx(e) {
	if (!e) return null;
	let t = e.getData(zb);
	if (!t) return null;
	try {
		return JSON.parse(t);
	} catch {
		return null;
	}
}
function nx(e) {
	if (!e) return !1;
	let t = Array.from(e.types || []);
	return !!(t.includes("application/x-xiio-tablet-compose") || t.includes("Files"));
}
// ../shared-node/src/components/desktop/WindowFramePresentation.jsx
var rx = ({ icon: e, active: t, label: n }) => {
	let r = e || Iu;
	return /* @__PURE__ */ y("button", {
		type: "button",
		"aria-label": n,
		className: gb("w-10 h-10 rounded-none flex items-center justify-center transition-colors duration-200 relative group cursor-pointer border", t ? "bg-[hsl(var(--color-intent))]/10 border-[hsl(var(--color-intent))] text-[hsl(var(--color-intent))]" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] hover:border-border"),
		children: [
			/* @__PURE__ */ v(r, { className: yb.bar }),
			t && /* @__PURE__ */ v("div", { className: "absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[hsl(var(--color-intent))]" }),
			/* @__PURE__ */ v("span", {
				className: "absolute left-12 top-1/2 -translate-y-1/2 px-2 py-1 bg-popover border border-border rounded-none text-[10px] font-medium text-popover-foreground opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50",
				children: n
			})
		]
	});
}, ix = 400, ax = 300, ox = Object.freeze({
	snapPinnedWindow: () => null,
	setSnapGuide: () => {},
	carryAttached: () => {},
	surfaceTopInset: 0,
	surfaceBottomInset: 0
}), sx = Object.freeze({ dragging: !1 }), cx = Object.freeze({
	useGrid: () => ox,
	useChatDock: () => sx,
	recordEvent: () => {}
});
function lx({ title: e, icon: t, theme: n, children: r, onClose: i, onMinimize: a, isActive: o, onFocus: s, lane: c, initialPosition: u, initialSize: d, onGeometryChange: f, nativeWindow: p, toolsEnabled: g = !0, toolRuntime: b, ...x }) {
	let { SystemFileBar: S, ChatDockSlot: C, WindowChatLanes: w, WindowFooterToolsDrawer: T, SablePreviewDock: E, ThreeLaneProviderDock: ee, WindowChatBay: D, TabletComposeTools: te, SeatAttachControl: O, AttachedChips: k, useGrid: A, useChatDock: j, recordEvent: M } = b, N = typeof p?.perform == "function", P = N && p.available === !1, [ne, re] = h(!1), F = N ? p.state?.maximized === !0 : ne, I = N && p.state?.fullscreen === !0, [L, ie] = h(0), [R, z] = h(() => Number.isFinite(d?.width) && d.width > 0 && Number.isFinite(d?.height) && d.height > 0 ? d : {
		width: Nb.w,
		height: Nb.h
	}), ae = Dl(), { snapPinnedWindow: oe, setSnapGuide: se, carryAttached: ce, surfaceTopInset: B = 0, surfaceBottomInset: V = 0 } = A(), [H, le] = h(!1), [ue, de] = h(!1), fe = !!j().dragging, U = g && (x.windowId || x.chatTarget?.id) || null, pe = Yb(U), me = Zb(U), he = ue || me, ge = (e) => {
		if (!g) return !1;
		let t = tx(e.dataTransfer);
		if (t && U) return e.preventDefault(), e.stopPropagation(), Qb(U, t), de(!1), le(!1), !0;
		let n = e.dataTransfer?.files;
		return n?.length && U ? (e.preventDefault(), e.stopPropagation(), Array.from(n).forEach((e, t) => {
			Qb(U, {
				kind: "file",
				id: `file:${e.name}:${e.size}:${t}`,
				title: e.name,
				name: e.name,
				path: e.name,
				tools: [
					"FileExplorer",
					"Preview",
					"Attach"
				]
			});
		}), de(!1), le(!1), !0) : !1;
	}, W = g ? {
		onDragEnter: (e) => {
			let t = nx(e.dataTransfer);
			(fe || t) && (e.preventDefault(), t ? de(!0) : le(!0));
		},
		onDragOver: (e) => {
			let t = nx(e.dataTransfer);
			(fe || t) && (e.preventDefault(), e.dataTransfer.dropEffect = t ? "copy" : "move", t && de(!0));
		},
		onDragLeave: (e) => {
			let t = e.currentTarget.getBoundingClientRect();
			(e.clientX <= t.left || e.clientX >= t.right || e.clientY <= t.top || e.clientY >= t.bottom) && (le(!1), de(!1));
		},
		onDrop: (e) => {
			ge(e) || (le(!1), de(!1));
		}
	} : {};
	l(() => {
		fe || le(!1);
	}, [fe]);
	let G = Dd({
		surfaceId: x.surfaceId,
		category: x.category,
		title: e
	}), _e = jd("canvas"), K = wl(u?.x ?? 100), q = wl(u?.y ?? 100), ve = m({
		x: u?.x ?? 100,
		y: u?.y ?? 100
	}), ye = () => {
		let e = x.constraintsRef?.current, t = e?.closest("main")?.querySelector(":scope > header.xi-header");
		return Math.max(B, Ib(e?.getBoundingClientRect(), t?.getBoundingClientRect()));
	};
	l(() => {
		let e = x.constraintsRef?.current;
		if (N || !F || !e) return;
		let t = e.closest("main"), n = null, r = () => {
			let r = t?.querySelector(":scope > header.xi-header") || null;
			r !== n && (n && i?.unobserve(n), r && i?.observe(r), n = r);
			let a = Math.max(B, Ib(e.getBoundingClientRect(), r?.getBoundingClientRect()));
			ie(a), K.set(0), q.set(a);
		}, i = typeof ResizeObserver < "u" ? new ResizeObserver(r) : null;
		i?.observe(e);
		let a = typeof MutationObserver < "u" ? new MutationObserver(r) : null;
		return t && a?.observe(t, { childList: !0 }), window.addEventListener("resize", r), r(), () => {
			i?.disconnect(), a?.disconnect(), window.removeEventListener("resize", r);
		};
	}, [
		x.constraintsRef,
		N,
		F,
		K,
		q,
		B
	]), l(() => {
		let e = x.constraintsRef?.current;
		if (N || !e || F) return;
		let t = e.closest("main"), n = null, r = () => {
			let r = t?.querySelector(":scope > header.xi-header") || null;
			r !== n && (n && i?.unobserve(n), r && i?.observe(r), n = r);
			let a = e.getBoundingClientRect(), o = Math.max(B, Ib(a, r?.getBoundingClientRect()));
			z((e) => {
				let t = Lb({
					x: K.get(),
					y: q.get(),
					w: e.width,
					h: e.height
				}, a, {
					top: o,
					bottom: V
				}), n = t.w !== e.width || t.h !== e.height, r = t.x !== K.get() || t.y !== q.get();
				return r && (K.set(t.x), q.set(t.y)), (n || r) && f?.({
					x: t.x,
					y: t.y,
					width: t.w,
					height: t.h
				}), n ? {
					width: t.w,
					height: t.h
				} : e;
			});
		}, i = typeof ResizeObserver < "u" ? new ResizeObserver(() => r()) : null;
		i?.observe(e);
		let a = typeof MutationObserver < "u" ? new MutationObserver(r) : null;
		return t && a?.observe(t, { childList: !0 }), window.addEventListener("resize", r), r(), () => {
			i?.disconnect(), a?.disconnect(), window.removeEventListener("resize", r);
		};
	}, [
		x.constraintsRef,
		N,
		F,
		K,
		q,
		R.width,
		R.height,
		B,
		V
	]);
	let [be, xe] = h("main"), Se = o && x.activeTab || be, Ce = (e) => {
		xe(e), x.onTabChange && x.onTabChange(e);
	}, we = x.tabs || [
		{
			id: "main",
			icon: Cu,
			label: "Main"
		},
		{
			id: "data",
			icon: tu,
			label: "Data"
		},
		{
			id: "git",
			icon: fu,
			label: "Version Control"
		},
		{
			id: "cpu",
			icon: $l,
			label: "System"
		}
	], Te = m(null), Ee = m(null);
	l(() => {
		let e = Ee.current;
		if (!e) return;
		let t = () => {
			let t = Te.current;
			if (t) {
				let e = parseFloat(getComputedStyle(t.ownerDocument.documentElement).fontSize) || 16, n = t.clientHeight < 15 * e ? "tight" : t.clientHeight < 26 * e ? "compact" : "regular";
				t.dataset.windowRailSize !== n && (t.dataset.windowRailSize = n);
			}
			if (e.clientHeight <= 0) return;
			let n = `${e.clientHeight}px`;
			e.style.getPropertyValue("--xi-window-viewport-height") !== n && e.style.setProperty("--xi-window-viewport-height", n);
		};
		return t(), Mb(e, t);
	}, []);
	let De = (e = {}) => {
		!N && f && f({
			x: K.get(),
			y: q.get(),
			width: e.width ?? R.width,
			height: e.height ?? R.height
		});
	}, Oe = m(0), ke = m(null), Ae = m(null), je = () => {
		N || (Ae.current = {
			x: K.get(),
			y: q.get()
		}, Te.current?.setAttribute("data-lifted", "true"));
	}, Me = (e, t) => {
		if (N) return;
		Oe.current += 1, ke.current ||= {
			x: Math.round(t?.point?.x ?? K.get()),
			y: Math.round(t?.point?.y ?? q.get())
		};
		let n = oe({
			x: K.get(),
			y: q.get(),
			w: R.width,
			h: R.height
		}, x.windowId, { dragKind: "window" }).guide;
		se((e) => jb(e, n) ? e : n);
	}, Ne = () => {
		if (N) return;
		let e = ke.current, t = Oe.current, n = oe({
			x: K.get(),
			y: q.get(),
			w: R.width,
			h: R.height
		}, x.windowId, { dragKind: "window" }), r = Lb({
			x: n.x,
			y: n.y,
			w: R.width,
			h: R.height
		}, x.constraintsRef?.current?.getBoundingClientRect(), {
			top: ye(),
			bottom: V
		});
		K.set(r.x), q.set(r.y), (r.w !== R.width || r.h !== R.height) && z({
			width: r.w,
			height: r.h
		}), se(null), Te.current?.removeAttribute("data-lifted");
		let i = Ae.current;
		Ae.current = null, i && ce(x.windowId, K.get() - i.x, q.get() - i.y);
		let a = {
			x: Math.round(K.get()),
			y: Math.round(q.get())
		};
		ke.current = null, Oe.current = 0, De({
			width: r.w,
			height: r.h
		});
		let o = vb({
			title: x.title,
			appId: x.appId,
			ticks: t,
			first: e,
			last: a
		});
		o && M(o);
	}, Pe = () => {
		if (!P) {
			if (N) return p.perform("maximize");
			if (F) K.set(ve.current.x), q.set(ve.current.y), re(!1);
			else {
				ve.current = {
					x: K.get(),
					y: q.get()
				};
				let e = ye();
				ie(e), K.set(0), q.set(e), re(!0);
			}
		}
	}, Fe = (e) => {
		if (e.button === 0 && !e.target?.closest?.("button, input, select, textarea, a, [role=\"button\"]") && !(N && e.type === "pointerdown" && e.pointerType === "mouse") && (N || e.type !== "mousedown")) {
			if (s?.(e), N) return F || I ? void 0 : (e.preventDefault(), P ? void 0 : p.perform("drag"));
			F || ae.start(e);
		}
	}, Ie = m(!1), Le = m(null);
	l(() => () => Le.current?.(), []);
	let Re = (e, t) => {
		if (e.button !== 0) return;
		if (e.preventDefault(), e.stopPropagation(), N) return F || I || P ? void 0 : p.perform("resize", t);
		Le.current?.(), Ie.current = !0;
		let n = Te.current, r = e.clientX, i = e.clientY, a = n ? n.offsetWidth : R.width, o = n ? n.offsetHeight : R.height, s = K.get(), c = q.get(), l = {
			left: t.includes("left"),
			right: t.includes("right"),
			top: t.includes("top"),
			bottom: t.includes("bottom")
		}, u = {
			width: a,
			height: o
		}, d = document.createElement("div");
		d.style.position = "fixed", d.style.top = "0", d.style.left = "0", d.style.right = "0", d.style.bottom = "0", d.style.zIndex = "var(--z-overlay)", d.style.cursor = t === "left" ? "w-resize" : t === "right" ? "e-resize" : t === "top" ? "n-resize" : t === "bottom" ? "s-resize" : `${t.includes("top") ? "n" : "s"}${t.includes("left") ? "w" : "e"}-resize`, document.body.appendChild(d);
		let f = (e) => {
			if (!Ie.current) return;
			let t = e.clientX - r, d = e.clientY - i, { x: f, y: p, w: m, h } = Rb({
				x: s,
				y: c,
				w: a,
				h: o
			}, {
				dx: t,
				dy: d
			}, l, x.constraintsRef?.current?.getBoundingClientRect(), {
				top: ye(),
				bottom: V
			}, {
				minW: ix,
				minH: ax
			});
			n && (n.style.width = `${m}px`, n.style.height = `${h}px`), K.set(f), q.set(p), u = {
				width: m,
				height: h
			};
		}, m = !0, h = () => {
			m && (m = !1, Ie.current = !1, document.removeEventListener("mousemove", f), document.removeEventListener("mouseup", g), window.removeEventListener("blur", g), d.remove(), Le.current = null);
		}, g = () => {
			h(), z(u), De(u);
		};
		Le.current = h, document.addEventListener("mousemove", f), document.addEventListener("mouseup", g), window.addEventListener("blur", g);
	};
	return /* @__PURE__ */ y(ob, { children: [/* @__PURE__ */ v(sb, {
		asChild: !0,
		children: /* @__PURE__ */ y(Cl.div, {
			ref: Te,
			drag: !N && !F,
			dragControls: ae,
			dragMomentum: !1,
			dragListener: !1,
			dragConstraints: x.constraintsRef,
			dragElastic: 0,
			onDragStart: je,
			onDrag: Me,
			onDragEnd: Ne,
			initial: !1,
			animate: {
				opacity: 1,
				scale: 1
			},
			onAnimationStart: () => Te.current?.setAttribute("data-settling", "true"),
			onAnimationComplete: () => Te.current?.removeAttribute("data-settling"),
			style: {
				zIndex: c,
				x: N ? 0 : K,
				y: N ? 0 : q,
				...N ? {
					inset: 0,
					minWidth: 0,
					minHeight: 0
				} : {},
				width: N || F ? "100%" : R.width,
				height: N ? "100%" : F ? `max(1px, calc(100% - ${V}px - ${L}px))` : R.height,
				...Ab(n),
				borderColor: H ? wb(n, .65) : o ? wb(n, .45) : "hsl(var(--border))"
			},
			exit: {
				opacity: 0,
				scale: .95,
				transition: { duration: .2 }
			},
			onPointerDownCapture: s,
			onFocusCapture: s,
			...W,
			"data-hot": H ? "true" : "false",
			"data-maximized": F ? "true" : "false",
			"data-native-window": N ? "true" : void 0,
			"data-tablet-compose-surface": U || void 0,
			"data-tablet-compose-hot": he ? "1" : "0",
			"data-tablet-compose-open": pe.open ? "1" : "0",
			className: gb(kb(n, "xi-window xi-desktop-glass xi-embedded absolute flex overflow-hidden"), "border"),
			children: [
				!H && /* @__PURE__ */ v("div", { className: "absolute inset-0 z-0 pointer-events-none bg-background/20" }),
				!F && !I && /* @__PURE__ */ y(_, { children: [
					/* @__PURE__ */ v("div", {
						className: "absolute left-0 top-3 bottom-3 w-1.5 cursor-w-resize z-50",
						onMouseDown: (e) => Re(e, "left")
					}),
					/* @__PURE__ */ v("div", {
						className: "absolute right-0 top-3 bottom-3 w-1.5 cursor-e-resize z-50",
						onMouseDown: (e) => Re(e, "right")
					}),
					/* @__PURE__ */ v("div", {
						className: "absolute top-0 left-3 right-3 h-1.5 cursor-n-resize z-50",
						onMouseDown: (e) => Re(e, "top")
					}),
					/* @__PURE__ */ v("div", {
						className: "absolute bottom-0 left-3 right-3 h-1.5 cursor-s-resize z-50",
						onMouseDown: (e) => Re(e, "bottom")
					}),
					/* @__PURE__ */ v("div", {
						className: "absolute left-0 top-0 w-3 h-3 cursor-nw-resize z-50",
						onMouseDown: (e) => Re(e, "left-top")
					}),
					/* @__PURE__ */ v("div", {
						className: "absolute right-0 top-0 w-3 h-3 cursor-ne-resize z-50",
						onMouseDown: (e) => Re(e, "right-top")
					}),
					/* @__PURE__ */ v("div", {
						className: "absolute left-0 bottom-0 w-3 h-3 cursor-sw-resize z-50",
						onMouseDown: (e) => Re(e, "left-bottom")
					}),
					/* @__PURE__ */ v("div", {
						className: "absolute right-0 bottom-0 w-5 h-5 cursor-se-resize z-50 group/resize",
						onMouseDown: (e) => Re(e, "right-bottom"),
						children: /* @__PURE__ */ v("div", { className: "absolute bottom-1 right-1 w-2 h-2 border-r-2 border-b-2 border-muted-foreground/40 group-hover/resize:border-foreground transition-colors" })
					})
				] }),
				/* @__PURE__ */ y("div", {
					"data-window-left-rail": "1",
					className: `w-16 border-r border-border flex flex-col items-center py-6 gap-6 z-20 shrink-0 relative xi-grid cursor-grab active:cursor-grabbing select-none text-foreground ${H ? "xi-desktop-glass-hot" : "xi-desktop-glass-chrome"}`,
					onPointerDown: Fe,
					onMouseDown: N ? Fe : void 0,
					onDoubleClick: Pe,
					children: [
						/* @__PURE__ */ v("div", {
							className: "absolute inset-0 pointer-events-none z-0",
							style: { backgroundColor: wb(n, .4) },
							"aria-hidden": "true"
						}),
						/* @__PURE__ */ y("div", {
							"data-window-rail-glyph": "1",
							className: "mt-2 mb-4 shrink-0 relative group/glyph",
							children: [/* @__PURE__ */ v("div", {
								className: "w-10 h-10 rounded-none flex items-center justify-center text-foreground relative z-10",
								children: v(t || Iu, { className: yb.bar })
							}), /* @__PURE__ */ v("div", {
								className: "absolute left-14 top-1/2 -translate-y-1/2 px-2 py-1 bg-popover border border-border rounded-none text-[10px] font-medium text-popover-foreground opacity-0 group-hover/glyph:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50",
								children: e
							})]
						}),
						/* @__PURE__ */ v("div", {
							"data-window-rail-tabs": "1",
							className: "flex flex-col gap-2 w-full px-2 flex-1 min-h-0 overflow-y-auto",
							children: we.map((e) => /* @__PURE__ */ v("div", {
								onClick: () => Ce(e.id),
								onPointerDown: (e) => e.stopPropagation(),
								children: /* @__PURE__ */ v(rx, {
									icon: e.icon,
									active: Se === e.id,
									label: e.label
								})
							}, e.id))
						}),
						/* @__PURE__ */ y("div", {
							"data-window-rail-controls": "1",
							className: "relative z-30 shrink-0 flex flex-col gap-3 w-full px-3 pb-4",
							onPointerDown: (e) => e.stopPropagation(),
							children: [
								g && x.onPin && /* @__PURE__ */ v("button", {
									type: "button",
									onClick: x.onPin,
									className: "w-10 h-10 rounded-none hover:bg-foreground/[0.06] flex items-center justify-center text-muted-foreground hover:text-[hsl(var(--color-intent))] transition-colors",
									title: "Pin to Desktop",
									"aria-label": "Pin to Desktop",
									"data-lesson-id": "ICONOGRAPHY-CONTRACT-001",
									children: /* @__PURE__ */ v(Lu, {
										className: yb.bar,
										"aria-hidden": "true"
									})
								}),
								/* @__PURE__ */ v("button", {
									type: "button",
									disabled: P,
									onClick: a,
									className: "w-10 h-10 rounded-none hover:bg-foreground/[0.06] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors",
									title: "Minimize",
									"aria-label": "Minimize window",
									"data-lesson-id": "ICONOGRAPHY-CONTRACT-001",
									children: /* @__PURE__ */ v(ju, {
										className: yb.bar,
										"aria-hidden": "true"
									})
								}),
								/* @__PURE__ */ v("button", {
									type: "button",
									disabled: P,
									onClick: Pe,
									className: "w-10 h-10 rounded-none hover:bg-foreground/[0.06] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors",
									title: F ? "Restore" : "Maximize",
									"aria-label": F ? "Restore window" : "Maximize window",
									"data-lesson-id": "ICONOGRAPHY-CONTRACT-001",
									children: v(F ? Au : Ou, {
										className: yb.bar,
										"aria-hidden": "true"
									})
								}),
								/* @__PURE__ */ v("button", {
									type: "button",
									disabled: P,
									onClick: i,
									className: "w-10 h-10 rounded-none hover:bg-[hsl(var(--color-warning))]/15 flex items-center justify-center text-muted-foreground hover:text-[hsl(var(--color-warning))] transition-colors",
									title: "Close",
									"aria-label": "Close window",
									"data-lesson-id": "ICONOGRAPHY-CONTRACT-001",
									children: /* @__PURE__ */ v(md, {
										className: yb.bar,
										"aria-hidden": "true"
									})
								})
							]
						})
					]
				}),
				/* @__PURE__ */ y("div", {
					className: "flex-1 min-w-0 min-h-0 relative flex flex-col overflow-hidden",
					children: [
						/* @__PURE__ */ y("div", {
							"data-xi-probe": "identity",
							"data-window-title-chrome": "1",
							"data-xi-category": G.category ?? "",
							"data-xi-title": G.title,
							className: `h-11 w-full shrink-0 relative z-40 cursor-grab active:cursor-grabbing select-none flex items-center gap-2 px-4 pr-24 border-b border-border xi-grid ${H ? "xi-desktop-glass-hot" : "xi-desktop-glass-chrome"}`,
							style: { backgroundColor: wb(n, .4) },
							onPointerDown: Fe,
							onMouseDown: N ? Fe : void 0,
							onDoubleClick: Pe,
							children: [
								/* @__PURE__ */ v(gu, { className: gb(yb.bar, "text-muted-foreground/70 shrink-0") }),
								t && /* @__PURE__ */ v(t, {
									className: gb(yb.bar, "shrink-0"),
									style: { color: wb(n, .95) }
								}),
								G.category && /* @__PURE__ */ v("span", {
									className: "shrink-0 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground border border-border",
									title: `category · from the ${G.category_source.toLowerCase()}`,
									children: G.category
								}),
								/* @__PURE__ */ v("span", {
									"data-xi-probe": "text",
									className: "min-w-0 truncate text-[11px] font-medium tracking-wide text-foreground",
									children: G.title
								}),
								g && /* @__PURE__ */ v(k, { hostId: x.windowId }),
								g && /* @__PURE__ */ v("div", {
									className: "ml-auto shrink-0 pointer-events-auto",
									onPointerDown: (e) => e.stopPropagation(),
									children: /* @__PURE__ */ v(O, {
										targetRef: x.windowId || x.chatTarget?.id,
										product: e,
										label: G.title
									})
								})
							]
						}),
						g && /* @__PURE__ */ v("div", {
							className: "absolute top-2 right-2 z-50 pointer-events-auto",
							children: /* @__PURE__ */ v(S, {
								appName: e,
								surfaceRef: x.chatTarget?.id || `surface:${e}`,
								workRef: x.chatTarget?.workRef || x.workRef || `surface:${e}`,
								artifactRef: x.artifactRef || null,
								className: "opacity-50 hover:opacity-100 transition-opacity"
							})
						}),
						/* @__PURE__ */ y("div", {
							ref: Ee,
							"data-window-work-scroll": "1",
							role: "region",
							"aria-label": `${G.title} content and tools`,
							tabIndex: 0,
							className: "flex-1 min-w-0 min-h-0 overflow-auto overscroll-contain relative xi-window-scroll xi-window-work-scroll",
							style: { "--xi-window-min-content-height": `${ax}px` },
							children: [
								/* @__PURE__ */ y("div", {
									"data-glass-side": _e.side,
									"data-article-layer": H ? "intent" : "state",
									"data-paper": x.paperCanvas ? "1" : void 0,
									"data-window-content-layout": x.contentLayout === "document" ? "document" : "application",
									className: gb("min-w-0 relative flex flex-col lg:flex-row xi-window-content-surface", "text-foreground", he && "ring-2 ring-inset ring-[hsl(var(--color-intent))]/55"),
									children: [
										/* @__PURE__ */ v("div", {
											"data-window-body-scroll": "1",
											"data-window-body-owner": "application-fallback",
											className: "flex-1 min-h-0 min-w-0 overflow-auto relative bg-background xi-window-scroll",
											children: r
										}),
										g && x.previewSrc ? /* @__PURE__ */ v(E, {
											windowId: x.windowId,
											src: x.previewSrc,
											defaultOpen: !0
										}) : null,
										g && x.chatTarget && /* @__PURE__ */ v(w, {
											targetId: x.chatTarget.id,
											label: x.chatTarget.label
										}),
										g && x.chatTarget && /* @__PURE__ */ v(C, { ...x.chatTarget }),
										U && /* @__PURE__ */ v(te, { windowId: U })
									]
								}),
								g && x.chatTarget && /* @__PURE__ */ v(D, {
									targetId: x.chatTarget.id,
									label: x.chatTarget.label,
									workRef: x.chatTarget.workRef,
									category: G.category,
									forceOpen: pe.open
								}),
								g && /* @__PURE__ */ v(T, {
									className: H ? "xi-desktop-glass-hot" : "xi-desktop-glass-chrome",
									surfaceLabel: G.title,
									secureContext: typeof window < "u" && window.isSecureContext
								}),
								g && x.chatTarget && /* @__PURE__ */ v(ee, {
									targetId: x.chatTarget.id,
									label: x.chatTarget.label
								})
							]
						})
					]
				}),
				/* @__PURE__ */ v("div", {
					"data-glass-side": "GLASS",
					"aria-hidden": !0,
					className: "pointer-events-none absolute inset-0 z-30 ring-1 ring-inset ring-[hsl(var(--glass-edge))]/10"
				})
			]
		})
	}), /* @__PURE__ */ y(ub, {
		className: "w-56 bg-popover backdrop-blur-xl border-border text-popover-foreground",
		children: [
			/* @__PURE__ */ y(db, {
				onSelect: s,
				children: [/* @__PURE__ */ v(Cu, { className: "w-4 h-4 mr-2" }), " Bring to Front"]
			}),
			/* @__PURE__ */ y(db, {
				disabled: P,
				onSelect: a,
				children: [/* @__PURE__ */ v(ju, { className: "w-4 h-4 mr-2" }), " Minimize"]
			}),
			/* @__PURE__ */ y(db, {
				disabled: P,
				onSelect: Pe,
				children: [v(F ? Au : Ou, { className: "w-4 h-4 mr-2" }), F ? "Restore Down" : "Maximize"]
			}),
			g && x.onPin && /* @__PURE__ */ y(db, {
				onSelect: x.onPin,
				children: [/* @__PURE__ */ v(Lu, { className: "w-4 h-4 mr-2" }), " Pin as tablet widget"]
			}),
			U && /* @__PURE__ */ y(_, { children: [
				/* @__PURE__ */ v(hb, { className: "bg-border" }),
				/* @__PURE__ */ y(db, {
					onSelect: () => Qb(U, {
						kind: "library",
						id: `manual:${U}`,
						title: G.title,
						tools: ["FileExplorer", "ProjectTools"]
					}),
					children: [/* @__PURE__ */ v(cu, { className: "w-4 h-4 mr-2" }), " Open tools drawer"]
				}),
				/* @__PURE__ */ y(db, {
					onSelect: () => Qb(U, {
						kind: "library",
						id: `chat:${U}`,
						title: "Chat",
						tools: ["Chat"]
					}),
					children: [/* @__PURE__ */ v(ku, { className: "w-4 h-4 mr-2" }), " Open chat drawer"]
				})
			] }),
			/* @__PURE__ */ v(hb, { className: "bg-border" }),
			/* @__PURE__ */ y(db, {
				disabled: P,
				onSelect: i,
				className: "text-[hsl(var(--color-warning))] focus:text-[hsl(var(--color-warning))]",
				children: [/* @__PURE__ */ v(md, { className: "w-4 h-4 mr-2" }), " Close Window"]
			})
		]
	})] });
}
// ../shared-node/src/lib/snapGuide.jsx
var ux = i({ setGuide: () => {} }), dx = i(null);
function fx({ children: e }) {
	let [t, n] = h(null), r = p(() => ({ setGuide: n }), []);
	return /* @__PURE__ */ v(ux.Provider, {
		value: r,
		children: /* @__PURE__ */ v(dx.Provider, {
			value: t,
			children: e
		})
	});
}
// ../shared-node/src/lib/nativeProductWindow.mjs
var px = /* @__PURE__ */ new Set([
	"state",
	"drag",
	"minimize",
	"maximize",
	"close",
	"resize"
]), mx = /* @__PURE__ */ new Map([
	["left", "w"],
	["right", "e"],
	["top", "n"],
	["bottom", "s"],
	["left-top", "nw"],
	["right-top", "ne"],
	["left-bottom", "sw"],
	["right-bottom", "se"],
	["n", "n"],
	["ne", "ne"],
	["e", "e"],
	["se", "se"],
	["s", "s"],
	["sw", "sw"],
	["w", "w"],
	["nw", "nw"]
]);
function hx(e, t) {
	if (!px.has(e)) return Promise.reject(/* @__PURE__ */ Error("Unsupported window action."));
	if (e !== "resize" && t !== void 0) return Promise.reject(/* @__PURE__ */ Error("Resize direction is only valid for resize."));
	let n = typeof t == "string" ? mx.get(t) : void 0;
	if (e === "resize" && !n) return Promise.reject(/* @__PURE__ */ Error("Unsupported resize direction."));
	let r = globalThis.window?.__TAURI_INTERNALS__?.invoke;
	return typeof r == "function" ? r("native_product_window", {
		action: e,
		...e === "resize" ? { direction: n } : {}
	}) : Promise.reject(/* @__PURE__ */ Error("The native window connection is unavailable."));
}
// ../shared-node/src/components/framework/NativeProductWindowShell.jsx
function gx({ product: e, isAuthenticated: t = !1, children: n, Frame: r = lx, bindingForCurrent: i = void 0, renderWorkspace: a = void 0, controlsAvailable: o = !0 }) {
	let [c, u] = h({}), [d, f] = h(null), p = s(async (e, t) => {
		if (!o) return null;
		try {
			let n = await hx(e, t);
			return n.closed || u(n), f(null), n;
		} catch {
			return f("The window controls could not reach the desktop. Alt+F4 can still close this window."), null;
		}
	}, [o]);
	l(() => {
		if (!o) return;
		let e = () => {
			p("state");
		};
		return e(), addEventListener("resize", e), addEventListener("focus", e), () => {
			removeEventListener("resize", e), removeEventListener("focus", e);
		};
	}, [p, o]);
	let m = (a = null, s = null, l = null) => {
		let u = a ? i(a) : {
			title: e.title,
			theme: e.theme,
			windowId: `window:native:${e.id}`
		}, m = s ? /* @__PURE__ */ y("div", {
			role: "alert",
			className: "p-4 text-sm",
			children: [
				s,
				" ",
				l && /* @__PURE__ */ v("button", {
					type: "button",
					onClick: l,
					children: "Retry"
				})
			]
		}) : t && !a ? /* @__PURE__ */ v("p", {
			role: "status",
			className: "p-4 text-sm",
			children: "Reading this product…"
		}) : n;
		return /* @__PURE__ */ v(r, {
			...u,
			toolRuntime: a ? void 0 : cx,
			toolsEnabled: !!a,
			isActive: !0,
			onFocus: () => {},
			initialPosition: {
				x: 0,
				y: 0
			},
			initialSize: {
				width: innerWidth,
				height: innerHeight
			},
			nativeWindow: {
				state: c,
				perform: p,
				available: o
			},
			onTabChange: a?.onTabChange,
			onClose: () => p("close"),
			onMinimize: () => p("minimize"),
			onPin: a ? () => f("Pinning is unavailable until the native desktop save connection is verified. This window will stay open.") : void 0,
			children: /* @__PURE__ */ y("div", {
				className: "flex h-full min-h-0 flex-col",
				"data-native-product": e.id,
				"data-chroma-key": u.theme,
				children: [d && /* @__PURE__ */ v("p", {
					role: "alert",
					className: "px-4 py-2 text-xs",
					children: d
				}), /* @__PURE__ */ v("div", {
					className: "relative min-h-0 flex-1 overflow-auto [&>.fixed]:absolute",
					children: m
				})]
			})
		});
	};
	return /* @__PURE__ */ v("div", {
		className: "dark relative h-dvh min-h-0 overflow-hidden bg-background text-foreground",
		children: /* @__PURE__ */ v(fx, { children: t ? a(m) : m() })
	});
}
// ../shared-node/src/lib/themeModeStore.js
var _x = "xiio.theme-mode", vx = "dark", yx = "light", bx = (e) => e === yx || e === vx ? e : null, xx = "xiio.theme-auto", Sx = Object.freeze([
	{
		id: "wide",
		label: "05:00 – 21:00",
		from: 5,
		to: 21
	},
	{
		id: "standard",
		label: "07:00 – 19:00",
		from: 7,
		to: 19
	},
	{
		id: "short",
		label: "09:00 – 17:00",
		from: 9,
		to: 17
	}
]), Cx = "standard", wx = (e) => Sx.find((t) => t.id === e) || Sx[1], Tx = (() => {
	try {
		let e = JSON.parse(localStorage.getItem(xx) || "null");
		return !e || typeof e != "object" ? {
			on: !1,
			day: Cx
		} : {
			on: e.on === !0,
			day: wx(e.day).id
		};
	} catch {
		return {
			on: !1,
			day: Cx
		};
	}
})(), Ex = 2, Dx = (e = /* @__PURE__ */ new Date(), t = Tx.day) => {
	let { from: n, to: r } = wx(t), i = e.getHours() + e.getMinutes() / 60 + e.getSeconds() / 3600, a = n - Ex / 2, o = n + Ex / 2, s = r - Ex / 2, c = r + Ex / 2;
	return i <= a || i >= c ? 0 : i < o ? Math.max(0, Math.min(1, (i - a) / (o - a))) : i <= s ? 1 : Math.max(0, Math.min(1, 1 - (i - s) / (c - s)));
}, Ox = () => {
	try {
		return bx(new URLSearchParams(window.location.search).get("theme"));
	} catch {
		return null;
	}
}, kx = () => {
	try {
		return bx(localStorage.getItem(_x));
	} catch {
		return null;
	}
}, Ax = () => {
	try {
		return window.matchMedia("(prefers-color-scheme: light)").matches ? yx : vx;
	} catch {
		return vx;
	}
}, jx = () => Ox() || kx(), Mx = jx() || Ax(), Nx = Dx(), Px = (e) => e <= .12 ? "night" : e < .62 ? "morning-evening" : "day", Fx = (e) => {
	typeof document < "u" && (document.documentElement.classList.toggle("dark", e === vx), document.documentElement.style.setProperty("--xi-daylight-phase", String(Nx)), document.documentElement.dataset.xiAppearance = e, document.documentElement.dataset.xiEnvironment = Px(Nx), document.documentElement.dataset.xiDaylight = Nx.toFixed(3));
};
Fx(Mx);
var Ix = /* @__PURE__ */ new Set(), Lx = /* @__PURE__ */ new Set(), Rx = () => {
	Ix.forEach((e) => e(Mx)), Lx.forEach((e) => e(Nx));
};
if (typeof window < "u" && typeof window.matchMedia == "function") {
	let e = window.matchMedia("(prefers-color-scheme: light)"), t = () => {
		jx() || Tx.on || (Mx = Ax(), Fx(Mx), Rx());
	};
	e.addEventListener ? e.addEventListener("change", t) : e.addListener && e.addListener(t);
}
function zx(e) {
	Mx = e === yx ? yx : vx;
	try {
		localStorage.setItem(_x, Mx);
	} catch {}
	Fx(Mx), Rx();
}
var Bx = null;
Tx.on && (Bx || typeof window > "u" || (Bx = window.setInterval(() => {
	if (!Tx.on) return;
	let e = Dx(), t = Math.abs(e - Nx) > .001;
	Nx = e, Fx(Mx), t && Rx();
}, 6e4)));
function Vx() {
	let [e, t] = h(Mx);
	return l(() => (Ix.add(t), () => Ix.delete(t)), []), e;
}
export { gx as NativeProductWindowShell, zx as setThemeMode, Vx as useThemeMode };
