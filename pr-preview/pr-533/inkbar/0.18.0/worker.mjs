//#region src/errors.ts
/**
* The error every engine call rejects with, apart from a `RangeError` for a bad page index or
* scale, a render larger than the pixel limit, a bad name or a box with no area in an
* appearance, or a region with no quads or a number that is not finite as a 32-bit float.
*/
var EngineError = class extends Error {
	/** What went wrong. */
	code;
	/** PDFium's own error number, when it gave one. For diagnostics only. */
	pdfiumError;
	/**
	* The id of the annotation a `write-failed` or `redaction-failed` error is about, when it is
	* about one.
	*/
	annotation;
	/**
	* The page index, from 0, a `redaction-failed` or `check-failed` error is about, when it is
	* about one.
	*/
	page;
	/**
	* Why a `redaction-failed` refused before changing anything, when it did: a mark over content
	* the apply cannot remove, or a page the engine could not look under.
	*/
	reason;
	/**
	* For `reason: 'unremovable-content'`: the ids of the marks given that lie over such content,
	* on every page. Inkbar's earlier locked marks have no id here; `page` names their page.
	*/
	marks;
	/** For `reason: 'unremovable-content'`: the kinds of content found under the marks. */
	kinds;
	constructor(code, message, options) {
		super(message, options && "cause" in options ? { cause: options.cause } : void 0);
		this.name = "EngineError";
		this.code = code;
		if (options?.pdfiumError !== void 0) this.pdfiumError = options.pdfiumError;
		if (options?.annotation !== void 0) this.annotation = options.annotation;
		if (options?.page !== void 0) this.page = options.page;
		if (options?.reason !== void 0) this.reason = options.reason;
		if (options?.marks !== void 0) this.marks = options.marks;
		if (options?.kinds !== void 0) this.kinds = options.kinds;
	}
};
function fromPdfiumError(error, hadPassword) {
	switch (error) {
		case 2:
		case 3: return new EngineError("invalid-pdf", "The file is not a valid PDF.");
		case 4: return hadPassword ? new EngineError("password-incorrect", "The password is incorrect.") : new EngineError("password-required", "The document needs a password.");
		case 5: return new EngineError("unsupported-security", "The document uses an unsupported security handler.");
		default: return new EngineError("engine-failure", `The engine failed (error ${error}).`, { pdfiumError: error });
	}
}
/**
* A bad argument from the caller. Callers see a plain `RangeError`; the subclass lets the engine
* tell its own range errors from one thrown out of the module, such as a stack overflow.
*/
var ArgumentError = class extends RangeError {
	constructor(message) {
		super(message);
		this.name = "RangeError";
	}
};
//#endregion
//#region src/signals.ts
const NOTHING = () => void 0;
/**
* A signal that aborts, with the same reason, as soon as any of `signals` does. Written by hand
* rather than with `AbortSignal.any`, which older browsers lack. Missing entries are skipped.
*/
function anySignal(signals) {
	const sources = signals.filter((s) => s !== void 0);
	if (sources.length === 1) return {
		signal: sources[0],
		dispose: NOTHING
	};
	const controller = new AbortController();
	const already = sources.find((s) => s.aborted);
	if (already) {
		controller.abort(already.reason);
		return {
			signal: controller.signal,
			dispose: NOTHING
		};
	}
	const listeners = sources.map((source) => {
		const onAbort = () => {
			dispose();
			controller.abort(source.reason);
		};
		source.addEventListener("abort", onAbort, { once: true });
		return {
			source,
			onAbort
		};
	});
	const dispose = () => {
		for (const { source, onAbort } of listeners) source.removeEventListener("abort", onAbort);
	};
	return {
		signal: controller.signal,
		dispose
	};
}
/**
* A signal that aborts after `ms`, and `dispose` to clear its timer. Written with a timer rather
* than `AbortSignal.timeout`, which older browsers lack.
*/
function timeoutSignal(ms) {
	const controller = new AbortController();
	const timer = setTimeout(() => {
		controller.abort(new DOMException("The fetch took too long.", "TimeoutError"));
	}, ms);
	return {
		signal: controller.signal,
		dispose: () => {
			clearTimeout(timer);
		},
		timedOut: () => controller.signal.aborted
	};
}
//#endregion
//#region src/fonts.ts
/** Each key's bit in the engine's key masks. */
const FONT_BITS = Object.freeze({
	japanese: 1,
	"simplified-chinese": 2,
	"traditional-chinese": 4,
	korean: 8,
	default: 16
});
const KEYS = Object.keys(FONT_BITS);
/** The keys whose bits are set in `bits`, in `FONT_BITS` order. */
function keysOf(bits) {
	return KEYS.filter((key) => (bits & FONT_BITS[key]) !== 0);
}
/**
* The longest one font fetch may take, in milliseconds. A fetch that runs out leaves the key
* missing for that call only: the next call that needs it fetches it again.
*/
const FONT_FETCH_TIMEOUT_MS = 6e4;
const isNode = () => typeof process !== "undefined" && typeof process.versions?.node === "string";
/** A Windows path such as `C:\fonts\a.ttf` parses as a URL with the scheme `c:`. */
const isUrl = (text) => URL.canParse(text) && !/^[a-z]:[\\/]/i.test(text);
const abortedError = () => new EngineError("aborted", "The call was aborted.");
/** Settles as `work`, or rejects with `aborted` as soon as `signal` aborts. */
function untilAborted(work, signal) {
	if (!signal) return work;
	return new Promise((resolve, reject) => {
		const onAbort = () => {
			reject(abortedError());
		};
		if (signal.aborted) onAbort();
		signal.addEventListener("abort", onAbort, { once: true });
		work.then(resolve, reject).finally(() => {
			signal.removeEventListener("abort", onAbort);
		});
	});
}
/** Reads a font: from disk for a Node path or `file:` URL, with `fetch` otherwise. */
async function read(source, signal) {
	const text = source instanceof URL ? source.href : source;
	if (isNode() && (!isUrl(text) || text.startsWith("file:"))) {
		const { readFile } = process.getBuiltinModule("node:fs/promises");
		const path = isUrl(text) ? new URL(text) : text;
		return new Uint8Array(await readFile(path, signal && { signal }));
	}
	const response = await fetch(text, signal && { signal });
	if (!response.ok) throw new Error(`${text} answered ${response.status}`);
	return new Uint8Array(await response.arrayBuffer());
}
/**
* Fetches each key's font the first time it is needed and hands its bytes to `register`. A key
* whose fetch fails (a network error, a status other than 2xx, bytes `register` refuses, or
* `register` running out of memory) is failed for the loader's life and not fetched again. An
* aborted fetch, or one that runs past `FONT_FETCH_TIMEOUT_MS`, fails nothing: the key is fetched
* again next time. A source is dropped once its key is settled, so its bytes are not kept once
* registered.
*/
function createFontLoader(sources, register) {
	const pending = new Map(Object.entries(sources ?? {}).filter(([, source]) => source !== void 0));
	const states = /* @__PURE__ */ new Map();
	const settle = (key, bytes) => {
		let registered = false;
		try {
			registered = bytes !== void 0 && register(key, bytes);
		} catch (error) {
			if (!(error instanceof EngineError && error.code === "out-of-memory")) throw error;
		}
		states.set(key, registered ? "registered" : "failed");
		pending.delete(key);
	};
	const missing = (keys) => keys.filter((key) => states.get(key) !== "registered");
	return {
		missing,
		fetches: pending.size > 0,
		async ensure(keys, signal) {
			for (const key of keys) {
				if (states.has(key)) continue;
				const source = pending.get(key);
				if (source === void 0) continue;
				if (signal?.aborted) throw abortedError();
				if (source instanceof Uint8Array) {
					settle(key, source);
					continue;
				}
				let bytes;
				const bound = timeoutSignal(FONT_FETCH_TIMEOUT_MS);
				const stop = anySignal([signal, bound.signal]);
				try {
					bytes = await untilAborted(read(source, stop.signal), stop.signal);
				} catch {
					if (signal?.aborted) throw abortedError();
					if (bound.timedOut()) continue;
					bytes = void 0;
				} finally {
					bound.dispose();
					stop.dispose();
				}
				if (signal?.aborted) throw abortedError();
				settle(key, bytes);
			}
			return missing(keys);
		}
	};
}
//#endregion
//#region src/native/strings.ts
function allocate(heap, size) {
	const pointer = heap.fn.malloc(Math.max(size, 1));
	if (pointer === 0) throw new EngineError("out-of-memory", "The engine ran out of memory.");
	return pointer;
}
/** Runs `use` with a block of `size` bytes that `fill` writes, and frees the block after. */
function withBlock(heap, size, fill, use) {
	const pointer = allocate(heap, size);
	try {
		fill(pointer);
		return use(pointer);
	} finally {
		if (!heap.stopped) heap.fn.free(pointer);
	}
}
/** `text` as a NUL-terminated UTF-8 string. `length` is its byte count without the NUL. */
function withUtf8(heap, text, use) {
	const length = heap.native.lengthBytesUTF8(text);
	return withBlock(heap, length + 1, (pointer) => {
		heap.native.stringToUTF8(text, pointer, length + 1);
	}, (pointer) => use(pointer, length));
}
/** `text` as a NUL-terminated UTF-16LE string. `length` is its code unit count without the NUL. */
function withUtf16(heap, text, use) {
	return withBlock(heap, (text.length + 1) * 2, (pointer) => {
		const bytes = heap.native.HEAPU8;
		for (let i = 0; i < text.length; i++) {
			const unit = text.charCodeAt(i);
			bytes[pointer + i * 2] = unit & 255;
			bytes[pointer + i * 2 + 1] = unit >> 8;
		}
		bytes[pointer + text.length * 2] = 0;
		bytes[pointer + text.length * 2 + 1] = 0;
	}, (pointer) => use(pointer, text.length));
}
/** A copy of `bytes` in engine memory. */
function withBytes(heap, bytes, use) {
	return withBlock(heap, bytes.length, (pointer) => {
		heap.native.HEAPU8.set(bytes, pointer);
	}, (pointer) => use(pointer, bytes.length));
}
/** `numbers` as 32-bit little-endian integers: an int, BOOL or pointer array. */
function withInts(heap, numbers, use) {
	return withBlock(heap, numbers.length * 4, (pointer) => {
		const bytes = heap.native.HEAPU8;
		const view = new DataView(bytes.buffer, bytes.byteOffset);
		numbers.forEach((n, i) => {
			view.setInt32(pointer + i * 4, n, true);
		});
	}, (pointer) => use(pointer, numbers.length));
}
/** Each of `texts` as a NUL-terminated UTF-16LE string, and an array of pointers to them. */
function withUtf16List(heap, texts, use) {
	const pointers = [];
	const next = (index) => {
		const text = texts[index];
		if (text === void 0) return withInts(heap, pointers, use);
		return withUtf16(heap, text, (pointer) => {
			pointers.push(pointer);
			return next(index + 1);
		});
	};
	return next(0);
}
/**
* Reads a string a native function copies out: `read(buffer, size)` returns the bytes the whole
* string needs, or 0 for none, and copies it when `size` is enough. `decode` turns those bytes,
* trailing NUL included, into text.
*/
function readString(heap, read, decode) {
	const size = read(0, 0);
	if (size <= 0) return "";
	const buffer = allocate(heap, size);
	try {
		const written = read(buffer, size);
		return decode(heap.native.HEAPU8.slice(buffer, buffer + Math.min(written, size)));
	} finally {
		if (!heap.stopped) heap.fn.free(buffer);
	}
}
/** `numbers` as 32-bit floats, the layout of PDFium's point, quad and rectangle structs. */
function withFloats(heap, numbers, use) {
	return withBlock(heap, numbers.length * 4, (pointer) => {
		heap.native.HEAPF32.set(numbers, pointer / 4);
	}, (pointer) => use(pointer, numbers.length));
}
//#endregion
//#region src/native/appearance.ts
/** A resource name: a PDF name without its slash, from the characters every reader accepts. */
const NAME = /^[A-Za-z0-9]+$/;
const STANDARD_FONTS$1 = /* @__PURE__ */ new Set([
	"Helvetica",
	"Helvetica-Bold",
	"Helvetica-Oblique",
	"Helvetica-BoldOblique",
	"Times-Roman",
	"Times-Bold",
	"Times-Italic",
	"Times-BoldItalic",
	"Courier",
	"Courier-Bold",
	"Courier-Oblique",
	"Courier-BoldOblique"
]);
const IMAGE_FORMATS = {
	png: 0,
	jpeg: 1
};
const entries = (record) => record ? Object.entries(record) : [];
/**
* Throws an `ArgumentError` for an appearance the engine cannot install whatever the document:
* bounds with no area, a resource name outside `[A-Za-z0-9]+`, a font that is not a standard one, an unknown image
* format, a page index that is not a whole number, or content that is not bytes. `where` names
* the appearance in the message.
*/
function checkAppearance(appearance, where) {
	const { bounds } = appearance;
	if (typeof bounds !== "object" || ![
		bounds.x,
		bounds.y,
		bounds.width,
		bounds.height
	].every(Number.isFinite)) throw new ArgumentError(`${where}: bounds must be four finite numbers`);
	const edge = Math.fround;
	if (!(edge(bounds.x) < edge(bounds.x + bounds.width)) || !(edge(bounds.y) < edge(bounds.y + bounds.height))) throw new ArgumentError(`${where}: bounds must have a width and a height above 0`);
	if (!(appearance.content instanceof Uint8Array)) throw new ArgumentError(`${where}: content must be a Uint8Array`);
	const named = (kind, name) => {
		if (!NAME.test(name)) throw new ArgumentError(`${where}: the ${kind} name "${name}" is not made of A-Z, a-z and 0-9`);
	};
	for (const [name, font] of entries(appearance.fonts)) {
		named("font", name);
		if (!STANDARD_FONTS$1.has(font)) throw new ArgumentError(`${where}: the font ${name} is not a standard font`);
	}
	for (const [name] of entries(appearance.opacities)) named("opacity", name);
	for (const [name, image] of entries(appearance.images)) {
		named("image", name);
		if (!Object.hasOwn(IMAGE_FORMATS, image.format) || !(image.data instanceof Uint8Array)) throw new ArgumentError(`${where}: the image ${name} must be PNG or JPEG bytes`);
	}
	for (const [name, index] of entries(appearance.pages)) {
		named("page", name);
		if (!Number.isInteger(index)) throw new ArgumentError(`${where}: the page ${name} must be a whole page index`);
	}
	for (const [name, form] of entries(appearance.forms)) {
		named("form", name);
		checkAppearance(form, `${where}, form ${name}`);
	}
}
/**
* Builds an appearance in `doc` and returns it, for the caller to install. Nested forms are built
* first and handed to their parent. On any failure everything built so far is freed and the
* error from `failed` is thrown, naming the part that failed. The appearance must have passed
* `checkAppearance`.
*/
function buildAppearance(heap, doc, appearance, failed, where = "its appearance") {
	const { fn } = heap;
	const { x, y, width, height } = appearance.bounds;
	const built = withBytes(heap, appearance.content, (content, length) => fn.INK_Appearance_New(doc, x, y, x + width, y + height, content, length, appearance.group ? 1 : 0));
	if (built === 0) throw failed(`${where} could not be started`);
	try {
		const add = (ok, what) => {
			if (!ok) throw failed(`${where}: ${what} could not be added`);
		};
		for (const [name, font] of entries(appearance.fonts)) add(withUtf8(heap, name, (n) => withUtf8(heap, font, (f) => fn.INK_Appearance_AddFont(built, n, f))), `the font ${name}`);
		for (const [name, { fill, stroke }] of entries(appearance.opacities)) add(withUtf8(heap, name, (n) => fn.INK_Appearance_AddOpacity(built, n, fill ?? -1, stroke ?? -1)), `the opacity ${name}`);
		for (const [name, image] of entries(appearance.images)) add(withUtf8(heap, name, (n) => withBytes(heap, image.data, (data, length) => fn.INK_Appearance_AddImage(built, n, IMAGE_FORMATS[image.format], data, length))), `the image ${name}`);
		for (const [name, index] of entries(appearance.pages)) add(withUtf8(heap, name, (n) => fn.INK_Appearance_AddPage(built, n, index)), `the page ${name} (page index ${index})`);
		for (const [name, form] of entries(appearance.forms)) {
			const child = buildAppearance(heap, doc, form, failed, `${where}, form ${name}`);
			let taken = false;
			try {
				add(withUtf8(heap, name, (n) => {
					taken = true;
					return fn.INK_Appearance_AddForm(built, n, child);
				}), `the form ${name}`);
			} finally {
				if (!taken && !heap.stopped) fn.INK_Appearance_Free(child);
			}
		}
		return built;
	} catch (error) {
		if (!heap.stopped) fn.INK_Appearance_Free(built);
		throw error;
	}
}
//#endregion
//#region src/native/annotations.ts
/** PDFium's annotation subtype numbers. */
const SUBTYPE = {
	Text: 1,
	FreeText: 3,
	Line: 4,
	Square: 5,
	Circle: 6,
	Polygon: 7,
	PolyLine: 8,
	Highlight: 9,
	Underline: 10,
	Squiggly: 11,
	StrikeOut: 12,
	Stamp: 13,
	Ink: 15,
	Redact: 28
};
const PRINT = 4;
/** Colour kinds for PDFium's colour setter: /C and /IC. */
const COLOR = 0;
const INTERIOR_COLOR = 1;
/**
* PDFium's border style numbers for /BS /S. Only these two are passed: the setter writes the
* width before it checks the style, so an unknown style would change the width and then fail.
*/
const BORDER_SOLID = 1;
const BORDER_DASHED = 2;
/**
* Whether `dashes` draws dashes: at least one length, every one finite and not negative, and not
* all zero. Anything else is written as a solid border.
*/
function isDashPattern(dashes) {
	return dashes !== void 0 && dashes.length > 0 && dashes.every((d) => Number.isFinite(d) && d >= 0) && dashes.some((d) => d > 0);
}
/** PDFium's line ending numbers, by PDF name. A name not listed is written as None. */
const LINE_ENDINGS = {
	None: 0,
	Square: 1,
	Circle: 2,
	Diamond: 3,
	OpenArrow: 4,
	ClosedArrow: 5,
	Butt: 6,
	ROpenArrow: 7,
	RClosedArrow: 8,
	Slash: 9
};
/** PDFium's standard font numbers: a family's regular face, then bold, bold italic, italic. */
const FONT_FAMILIES = {
	Courier: 0,
	Helvetica: 4,
	Times: 8
};
/** What a font family name says about its family, as Inkbar lays text out on screen. */
const TIMES = /times|serif|roman|georgia|garamond|minion|cambria|palatino/i;
const COURIER = /courier|mono|consol|menlo|typewriter|code/i;
const SANS = /sans/i;
/**
* PDFium's text alignment numbers: /Q. Justified text, and a name not listed, is written as
* left-aligned.
*/
const ALIGNMENT = {
	left: 0,
	center: 1,
	right: 2,
	justify: 0
};
/** The number `table` holds for `name` as its own key, or 0: an inherited key is not a name. */
const numbered = (table, name) => name !== void 0 && Object.hasOwn(table, name) ? table[name] : 0;
/** The standard font number nearest to a free text box's style. */
function standardFont(family, bold, italic) {
	return (TIMES.test(family) && !SANS.test(family) ? FONT_FAMILIES.Times : COURIER.test(family) ? FONT_FAMILIES.Courier : FONT_FAMILIES.Helvetica) + (bold ? italic ? 2 : 1 : italic ? 3 : 0);
}
/** The PDF subtype an annotation is written as. A loupe or a mask is a stamp; a reply a note. */
function subtypeOf(annotation, reply) {
	if (reply) return SUBTYPE.Text;
	const inkbar = annotation.custom?.inkbar;
	const kind = typeof inkbar === "object" && inkbar !== null && "type" in inkbar ? inkbar.type : void 0;
	if ((annotation.type === "circle" || annotation.type === "square") && (kind === "loupe" || kind === "mask")) return SUBTYPE.Stamp;
	const subtypes = {
		highlight: SUBTYPE.Highlight,
		underline: SUBTYPE.Underline,
		strikeout: SUBTYPE.StrikeOut,
		squiggly: SUBTYPE.Squiggly,
		text: SUBTYPE.Text,
		freetext: SUBTYPE.FreeText,
		square: SUBTYPE.Square,
		circle: SUBTYPE.Circle,
		line: SUBTYPE.Line,
		polyline: SUBTYPE.PolyLine,
		polygon: SUBTYPE.Polygon,
		ink: SUBTYPE.Ink,
		stamp: SUBTYPE.Stamp,
		redact: SUBTYPE.Redact
	};
	return Object.hasOwn(subtypes, annotation.type) ? subtypes[annotation.type] : void 0;
}
/** `#rrggbb` as three numbers from 0 to 255, or undefined when it is not one. */
function rgb(color) {
	const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
	if (!match) return void 0;
	return [
		1,
		2,
		3
	].map((i) => Number.parseInt(match[i], 16));
}
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:(Z)|([+-])(\d{2}):?(\d{2}))$/i;
/**
* An ISO 8601 date-time as a PDF date string, keeping its offset: `2026-11-17T10:45:15+01:00`
* is `D:20261117104515+01'00'`. Fractions of a second are dropped.
*/
function pdfDate(iso) {
	const m = ISO_DATE.exec(iso);
	if (!m) return void 0;
	const [, year, month, day, hour, minute, second = "00", zulu, sign, offH, offM] = m;
	return `D:${year}${month}${day}${hour}${minute}${second}${zulu ? "Z" : `${sign}${offH}'${offM}'`}`;
}
const quadFloats = (q) => [
	q.p1.x,
	q.p1.y,
	q.p2.x,
	q.p2.y,
	q.p3.x,
	q.p3.y,
	q.p4.x,
	q.p4.y
];
const pointFloats = (points) => points.flatMap((p) => [p.x, p.y]);
/**
* Whether every number in `value`, at any depth, is one PDFium can take: finite, and still
* finite as the 32-bit float it is passed as. Dash lists are left to `isDashPattern`.
*/
function finiteThroughout(value) {
	if (typeof value === "number") return Number.isFinite(Math.fround(value));
	if (Array.isArray(value)) return value.every(finiteThroughout);
	if (typeof value === "object" && value !== null) return Object.entries(value).every(([key, entry]) => key === "dashes" || finiteThroughout(entry));
	return true;
}
/**
* Writes one annotation on `page` and returns its handle, which the caller closes. A reply is
* linked to `target`, the handle of the file annotation its `replyTo` names (0 when the page has
* none), or else to its parent's handle in `parents`, by Gloss id: the annotations written
* earlier in the same call. On failure the annotation's
* handle is closed and a `write-failed` error naming its id is thrown; the annotation may be
* left half written in the document, so the caller discards the document.
*/
function writeAnnotation(heap, doc, page, item, parents, target) {
	const { fn } = heap;
	const { annotation } = item;
	const failed = (what) => new EngineError("write-failed", `Annotation ${annotation.id} could not be written: ${what}.`, { annotation: annotation.id });
	const check = (ok, what) => {
		if (!ok) throw failed(`${what} could not be set`);
	};
	const { replyTo } = item;
	const reply = replyTo !== void 0 || annotation.inReplyTo !== void 0;
	const subtype = subtypeOf(annotation, reply);
	if (subtype === void 0) throw failed(`the type ${annotation.type} is not one it knows`);
	if (replyTo && !target) throw failed(`the annotation it replies to, object ${replyTo.objectNumber} on page ${replyTo.page}, is not there`);
	const parent = replyTo ? target : reply ? parents.get(annotation.inReplyTo) : void 0;
	if (reply && parent === void 0) throw failed(`its parent ${annotation.inReplyTo} is not among the annotations written before it in the same call; a parent must come earlier in the list than its replies`);
	if (!reply && !item.appearance) throw failed("it has no appearance");
	if (!finiteThroughout(annotation)) throw failed("one of its numbers is not finite, or is too large to write");
	const annot = fn.FPDFPage_CreateAnnot(page, subtype);
	if (annot === 0) throw failed("it could not be created");
	try {
		const setString = (key, value) => {
			if (value === void 0) return;
			check(withUtf8(heap, key, (k) => withUtf16(heap, value, (v) => fn.FPDFAnnot_SetStringValue(annot, k, v))), `/${key}`);
		};
		const setColor = (kind, color, key) => {
			if (color === void 0) return;
			const parts = rgb(color);
			if (!parts) throw failed(`its colour ${color} is not #rrggbb`);
			check(fn.EPDFAnnot_SetColor(annot, kind, ...parts), `/${key}`);
		};
		const setDate = (key, iso) => {
			if (iso === void 0) return;
			const date = pdfDate(iso);
			if (!date) throw failed(`its date ${iso} is not an ISO 8601 date-time`);
			setString(key, date);
		};
		const setName = (setter, name, key) => {
			check(withUtf8(heap, name, (n) => setter(n)), `/${key}`);
		};
		const appendQuads = (quads) => {
			for (const quad of quads ?? []) check(withFloats(heap, quadFloats(quad), (q) => fn.FPDFAnnot_AppendAttachmentPoints(annot, q)), "/QuadPoints");
		};
		const setBorder = (width, dashes, radius = 0) => {
			if (width === void 0) return;
			check(fn.FPDFAnnot_SetBorder(annot, radius, radius, width), "/Border");
			const dashed = isDashPattern(dashes);
			check(fn.EPDFAnnot_SetBorderStyle(annot, dashed ? BORDER_DASHED : BORDER_SOLID, width), "/BS");
			if (dashed) check(withFloats(heap, dashes, (pattern, count) => fn.EPDFAnnot_SetBorderDashPattern(annot, pattern, count)), "/BS /D");
		};
		const setEndings = (head, tail) => {
			if (head === void 0 && tail === void 0) return;
			check(fn.EPDFAnnot_SetLineEndings(annot, numbered(LINE_ENDINGS, head), numbered(LINE_ENDINGS, tail)), "/LE");
		};
		setString("NM", annotation.id);
		setString("Contents", annotation.contents);
		setString("T", annotation.author);
		setString("Subj", annotation.subject);
		setDate("CreationDate", annotation.createdAt);
		setDate("M", annotation.modifiedAt);
		setColor(COLOR, annotation.color, "C");
		const opacity = annotation.opacity ?? 1;
		if (opacity !== 1) check(fn.EPDFAnnot_SetOpacity(annot, opacity), "/CA");
		if (annotation.intent !== void 0) setName((n) => fn.EPDFAnnot_SetIntent(annot, n), annotation.intent, "IT");
		if (reply) {
			if (annotation.type === "text") setName((n) => fn.EPDFAnnot_SetName(annot, n), annotation.icon ?? "Note", "Name");
		} else if (subtype !== SUBTYPE.Stamp || annotation.type === "stamp") switch (annotation.type) {
			case "highlight":
			case "underline":
			case "strikeout":
			case "squiggly":
				appendQuads(annotation.quads);
				break;
			case "text":
				setName((n) => fn.EPDFAnnot_SetName(annot, n), annotation.icon ?? "Note", "Name");
				break;
			case "freetext": {
				const style = annotation.defaultStyle;
				const text = rgb(style?.color ?? "#000000");
				if (!text) throw failed(`its text colour ${style?.color} is not #rrggbb`);
				check(fn.EPDFAnnot_SetDefaultAppearance(annot, standardFont(style?.fontFamily ?? "Helvetica", style?.fontWeight === "bold", style?.fontStyle === "italic"), style?.fontSize ?? 12, ...text), "/DA");
				check(fn.EPDFAnnot_SetTextAlignment(annot, numbered(ALIGNMENT, style?.textAlign)), "/Q");
				setBorder(annotation.width, annotation.dashes, annotation.cornerRadius);
				const callout = annotation.callout;
				if (callout && callout.length > 0) {
					if (callout.length !== 2 && callout.length !== 3) throw failed("its callout line needs two or three points");
					check(withFloats(heap, pointFloats(callout), (points) => fn.EPDFAnnot_SetCalloutLine(annot, points, callout.length)), "/CL");
					if (annotation.intent === void 0) setName((n) => fn.EPDFAnnot_SetIntent(annot, n), "FreeTextCallout", "IT");
					if (annotation.head !== void 0) setEndings(void 0, annotation.head);
				}
				break;
			}
			case "square":
			case "circle":
				setColor(INTERIOR_COLOR, annotation.interiorColor, "IC");
				setBorder(annotation.width, annotation.dashes, annotation.type === "square" ? annotation.cornerRadius : void 0);
				break;
			case "line":
				check(withFloats(heap, pointFloats([annotation.start]), (start) => withFloats(heap, pointFloats([annotation.end]), (end) => fn.EPDFAnnot_SetLine(annot, start, end))), "/L");
				setEndings(annotation.head, annotation.tail);
				setBorder(annotation.width, annotation.dashes);
				break;
			case "polyline":
			case "polygon":
				check(withFloats(heap, pointFloats(annotation.vertices), (points) => fn.EPDFAnnot_SetVertices(annot, points, annotation.vertices.length)), "/Vertices");
				setColor(INTERIOR_COLOR, annotation.interiorColor, "IC");
				if (annotation.type === "polyline") setEndings(annotation.head, annotation.tail);
				setBorder(annotation.width, annotation.dashes);
				break;
			case "ink":
				for (const stroke of annotation.inklist) check(withFloats(heap, pointFloats(stroke), (points) => fn.FPDFAnnot_AddInkStroke(annot, points, stroke.length) >= 0 ? 1 : 0), "/InkList");
				setBorder(annotation.width, annotation.dashes);
				break;
			case "redact":
				appendQuads(annotation.quads);
				setColor(INTERIOR_COLOR, annotation.interiorColor, "IC");
				setString("OverlayText", annotation.overlayText);
		}
		if (reply) {
			const { x, y, width, height } = annotation.rect;
			check(withFloats(heap, [
				x,
				y + height,
				x + width,
				y
			], (r) => fn.FPDFAnnot_SetRect(annot, r)), "/Rect");
			check(withUtf8(heap, "IRT", (key) => fn.EPDFAnnot_SetLinkedAnnot(annot, key, parent)), "/IRT");
			check(fn.FPDFAnnot_SetFlags(annot, 6), "/F");
		} else {
			check(fn.FPDFAnnot_SetFlags(annot, PRINT), "/F");
			const appearance = buildAppearance(heap, doc, item.appearance, failed);
			check(fn.INK_Annot_SetAppearance(annot, appearance), "its appearance");
		}
		check(withBytes(heap, new TextEncoder().encode(item.data), (data, length) => fn.INK_Annot_SetData(annot, data, length)), "its data");
		return annot;
	} catch (error) {
		if (!heap.stopped) fn.FPDFPage_CloseAnnot(annot);
		throw error;
	}
}
//#endregion
//#region src/native/report.ts
function fail$1(what, cause) {
	return new EngineError("engine-failure", `${what} could not be read.`, { cause: cause ?? /* @__PURE__ */ new Error("unexpected shape") });
}
/** A failure whose cause names the key at fault and what it should have held. */
function bad(what, key, expected) {
	return fail$1(what, /* @__PURE__ */ new Error(`${key}: expected ${expected}`));
}
function parse(text, what) {
	try {
		return JSON.parse(text);
	} catch (cause) {
		throw fail$1(what, cause);
	}
}
function isObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function object(value, what, key) {
	if (!isObject(value)) throw bad(what, key, "an object");
	return value;
}
function array(value, what, key) {
	if (!Array.isArray(value)) throw bad(what, key, "a list");
	return value;
}
function number(value, what, key) {
	if (typeof value !== "number" || !Number.isFinite(value)) throw bad(what, key, "a finite number");
	return value;
}
function string(value, what, key) {
	if (typeof value !== "string") throw bad(what, key, "a string");
	return value;
}
function hexBytes(value, what, key) {
	const text = string(value, what, key);
	if (text.length % 2 !== 0 || /[^0-9a-f]/i.test(text)) throw bad(what, key, "hex digits in pairs");
	const bytes = new Uint8Array(text.length / 2);
	for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16);
	return bytes;
}
const present = (value) => value !== null && value !== void 0;
function boolean(value, what, key) {
	if (typeof value !== "boolean") throw bad(what, key, "a boolean");
	return value;
}
/** A whole number from 0. */
function count(value, what, key) {
	const n = number(value, what, key);
	if (!Number.isInteger(n) || n < 0) throw bad(what, key, "a whole number from 0");
	return n;
}
/** A whole number from -1: an index, or -1 for none. */
function indexOrNone(value, what, key) {
	const n = number(value, what, key);
	if (!Number.isInteger(n) || n < -1) throw bad(what, key, "a whole number from -1");
	return n;
}
/** One of `values`; any other string, or anything else, is malformed. */
function oneOf(values, value, what, key) {
	if (!values.includes(value)) throw bad(what, key, `one of ${values.join(", ")}`);
	return value;
}
/** A key the fork writes only as `true`: absent, `null` or `true`. */
function onlyTrue(value, what, key) {
	if (!present(value)) return false;
	if (value !== true) throw bad(what, key, "true, null or no key");
	return true;
}
/** A number, or `null` where the file has no finite number. */
function numberOrNull(value, what, key) {
	return value === null ? null : number(value, what, key);
}
/** A list of numbers, each `null` where the file has no finite number. */
function numbers(value, what, key) {
	return array(value, what, key).map((n) => numberOrNull(n, what, key));
}
/** A name of the file, each character the code point of one of its bytes. */
function name(value, what, key) {
	const text = string(value, what, key);
	if (/[^\u0000-ÿ]/.test(text)) throw bad(what, key, "a name of bytes");
	return text;
}
/** A text string: its text, or `{ bytes: "<hex>" }` for bytes in no text encoding. */
function fileText(value, what, key) {
	if (typeof value === "string") return value;
	const item = object(value, what, key);
	if (Object.keys(item).length !== 1) throw bad(what, key, "text or { bytes }");
	return { bytes: hexBytes(item.bytes, what, key) };
}
/** `[number, generation]`. */
function ref(value, what, key) {
	const [objectNumber, generation, ...rest] = array(value, what, key).map((n) => count(n, what, key));
	if (objectNumber === void 0 || generation === void 0 || rest.length > 0) throw bad(what, key, "two numbers");
	return {
		objectNumber,
		generation
	};
}
/**
* `objectNumber` and `generation`: both present for an object of the file, both absent for a
* direct dictionary, which has no number.
*/
function objectId(item, what) {
	if (!present(item.objectNumber) && !present(item.generation)) return {};
	const objectNumber = count(item.objectNumber, what, "objectNumber");
	if (objectNumber === 0) throw bad(what, "objectNumber", "a number from 1");
	return {
		objectNumber,
		generation: count(item.generation, what, "generation")
	};
}
/** Reads the call's JSON, then frees it. NULL means the call could not read. */
function takeJson(heap, pointer, what) {
	if (pointer === 0) throw new EngineError("engine-failure", `${what} could not be read.`, { pdfiumError: heap.fn.FPDF_GetLastError() });
	try {
		const bytes = heap.native.HEAPU8;
		const end = bytes.indexOf(0, pointer);
		if (end < 0) throw fail$1(what);
		return new TextDecoder().decode(bytes.subarray(pointer, end));
	} finally {
		if (!heap.stopped) heap.fn.INK_Json_Free(pointer);
	}
}
//#endregion
//#region src/native/annots.ts
const APPEARANCES = ["stream", "states"];
/**
* A name the report writes as `null` only when its budget ran out. Then the entry says
* `truncated` (`cut`), and the name is left out.
*/
function cutName(item, key, what, cut = item.truncated === true) {
	const value = item[key];
	if (value !== null) return name(value, what, key);
	if (!cut) throw bad(what, key, "a name, or null in a cut entry");
}
/** A dash as written: its numbers, or `null` when the file's entry is not a list. */
const dash = (value, what, key) => value === null ? null : numbers(value, what, key);
/** The keys an annotation and a widget share, written alike for both. */
function appearanceFacts(item, what) {
	const facts = {
		rect: item.rect === null ? null : numbers(item.rect, what, "rect"),
		rectOk: boolean(item.rectOk, what, "rectOk"),
		flags: number(item.flags, what, "flags"),
		hasAppearance: boolean(item.hasAppearance, what, "hasAppearance"),
		appearanceStates: present(item.states) ? array(item.states, what, "states").map((s) => name(s, what, "states")) : []
	};
	if (facts.rect && facts.rect.length > 4) throw bad(what, "rect", "four numbers at most");
	if (!("appearance" in item)) throw bad(what, "appearance", "stream, states or null");
	if (item.appearance !== null) facts.appearance = oneOf(APPEARANCES, item.appearance, what, "appearance");
	if (present(item.states) !== (facts.appearance === "states")) throw bad(what, "states", "a list exactly when the appearance is states");
	if ("as" in item) {
		const state = cutName(item, "as", what);
		if (state !== void 0) facts.appearanceState = state;
	}
	if (present(item.borderStyle)) {
		const style = object(item.borderStyle, what, "borderStyle");
		facts.borderStyle = {
			width: numberOrNull(style.width, what, "borderStyle.width"),
			style: style.style === null ? null : name(style.style, what, "borderStyle.style")
		};
		if ("dash" in style) facts.borderStyle.dash = dash(style.dash, what, "borderStyle.dash");
	}
	if (present(item.border)) facts.border = numbers(item.border, what, "border");
	if ("borderDash" in item) {
		if (!facts.border) throw bad(what, "borderDash", "a dash only beside border");
		facts.borderDash = dash(item.borderDash, what, "borderDash");
	}
	return facts;
}
function annotation(raw, what) {
	const item = object(raw, what, "annots");
	const entry = {
		index: count(item.index, what, "index"),
		subtype: cutName(item, "subtype", what) ?? "",
		...objectId(item, what),
		...appearanceFacts(item, what)
	};
	for (const key of [
		"quads",
		"color",
		"interiorColor",
		"line",
		"vertices"
	]) if (present(item[key])) entry[key] = numbers(item[key], what, key);
	if (present(item.opacity)) entry.opacity = number(item.opacity, what, "opacity");
	else if (item.opacity === null) entry.opacity = null;
	for (const key of [
		"contents",
		"author",
		"created",
		"modified"
	]) if (present(item[key])) entry[key] = fileText(item[key], what, key);
	for (const key of ["icon", "intent"]) if (key in item) {
		const value = cutName(item, key, what);
		if (value !== void 0) entry[key] = value;
	}
	if (present(item.inReplyTo)) entry.inReplyTo = ref(item.inReplyTo, what, "inReplyTo");
	if (present(item.lineEndings)) entry.lineEndings = array(item.lineEndings, what, "lineEndings").map((n) => n === null ? null : name(n, what, "lineEndings"));
	if (present(item.inkLists)) entry.inkLists = array(item.inkLists, what, "inkLists").map((path) => path === null ? null : numbers(path, what, "inkLists"));
	if (present(item.da)) entry.defaultAppearance = fileText(item.da, what, "da");
	if ("q" in item) entry.alignment = numberOrNull(item.q, what, "q");
	if (onlyTrue(item.pmd, what, "pmd")) entry.paperMetadata = true;
	if (present(item.parent)) entry.parent = ref(item.parent, what, "parent");
	if (onlyTrue(item.truncated, what, "truncated")) entry.truncated = true;
	return entry;
}
/** The JSON `INK_Annots_Page` returns. */
function parsePageAnnotations(text) {
	const what = "A page's annotations";
	const root = object(parse(text, what), what, "root");
	const truncated = boolean(root.truncated, what, "truncated");
	const result = {
		annotations: array(root.annots, what, "annots").map((raw) => annotation(raw, what)),
		truncated
	};
	if (!("tabs" in root)) throw bad(what, "tabs", "a name or null");
	if (root.tabs !== null) result.tabs = name(root.tabs, what, "tabs");
	return result;
}
function readPageAnnotations(heap, doc, index) {
	return parsePageAnnotations(takeJson(heap, heap.fn.INK_Annots_Page(doc, index), "A page's annotations"));
}
/** The JSON `INK_Struct_Order` returns. */
function parseStructureOrder(text) {
	const what = "A page's structure order";
	const root = object(parse(text, what), what, "root");
	return {
		order: array(root.order, what, "order").map((n) => {
			const objectNumber = count(n, what, "order");
			if (objectNumber === 0) throw bad(what, "order", "object numbers from 1");
			return objectNumber;
		}),
		truncated: boolean(root.truncated, what, "truncated")
	};
}
function readStructureOrder(heap, doc, index) {
	return parseStructureOrder(takeJson(heap, heap.fn.INK_Struct_Order(doc, index), "A page's structure order"));
}
//#endregion
//#region src/native/fields.ts
/** The fork's field families. */
const CHECKBOX = 2;
const RADIO = 3;
const TEXT = 4;
const COMBO = 5;
const LIST = 6;
const SIGNATURE = 7;
/** The shapes of a field value, as the fork reads and writes them. */
const VALUE_NONE = 0;
const VALUE_SCALAR = 1;
const VALUE_ARRAY = 2;
/** A value of another shape: for a signature field, its signature dictionary. */
const VALUE_UNSUPPORTED = 3;
/** Choice field flags in /Ff (ISO 32000-2, table 231), by their 1-based bit position. */
const EDIT = 1 << 18;
const MULTI_SELECT = 1 << 21;
const OFF = "Off";
const utf16 = (bytes) => {
	let text = "";
	for (let i = 0; i + 1 < bytes.length; i += 2) {
		const unit = bytes[i] | bytes[i + 1] << 8;
		if (unit === 0) break;
		text += String.fromCharCode(unit);
	}
	return text;
};
const utf8 = (bytes) => {
	const end = bytes.indexOf(0);
	return new TextDecoder().decode(end === -1 ? bytes : bytes.subarray(0, end));
};
/** Runs `use` with the form model of `doc`, and closes the model after. */
function withModel(heap, doc, failure, use) {
	const model = heap.fn.EPDFForm_LoadModel(doc);
	if (model === 0) throw failure();
	try {
		return use(model);
	} finally {
		if (!heap.stopped) heap.fn.EPDFForm_CloseModel(model);
	}
}
/** The fields of the form by full name. The first of two fields with one name wins. */
function readForm$1(heap, model) {
	const fn = heap.fn;
	const fields = /* @__PURE__ */ new Map();
	const count = fn.EPDFForm_CountFields(model);
	for (let index = 0; index < count; index++) {
		const name = readString(heap, (buffer, size) => fn.EPDFForm_GetFieldName(model, index, buffer, size), utf16);
		if (fields.has(name)) continue;
		const family = fn.EPDFForm_GetFieldFamily(model, index);
		const onStates = [];
		if (family === CHECKBOX || family === RADIO) {
			const widgets = fn.EPDFForm_CountFieldWidgets(model, index);
			for (let widget = 0; widget < widgets; widget++) onStates.push(readString(heap, (buffer, size) => fn.EPDFForm_GetFieldWidgetOnState(model, index, widget, buffer, size), utf8));
		}
		const options = [];
		if (family === COMBO || family === LIST) {
			const total = fn.EPDFForm_CountFieldOptions(model, index);
			for (let option = 0; option < total; option++) options.push(readString(heap, (buffer, size) => fn.EPDFForm_GetFieldOptionValue(model, index, option, buffer, size), utf16));
		}
		fields.set(name, {
			objectNumber: fn.EPDFForm_GetFieldObjNum(model, index),
			family,
			flags: fn.EPDFForm_GetFieldFlags(model, index) >>> 0,
			onStates,
			options
		});
	}
	return fields;
}
/** The full names of the form's fields. */
function formFieldNames(heap, doc) {
	const fn = heap.fn;
	const failure = () => new EngineError("engine-failure", "The form could not be read.");
	return withModel(heap, doc, failure, (model) => {
		const names = /* @__PURE__ */ new Set();
		const count = fn.EPDFForm_CountFields(model);
		for (let index = 0; index < count; index++) names.add(readString(heap, (buffer, size) => fn.EPDFForm_GetFieldName(model, index, buffer, size), utf16));
		return names;
	});
}
/**
* Whether the document holds a digital signature: a signature field whose value is a signature
* dictionary. An empty signature field, a place to sign later, is not one.
*/
function hasSignature(heap, doc) {
	const fn = heap.fn;
	const failure = () => new EngineError("engine-failure", "The document's signatures could not be read.");
	return withModel(heap, doc, failure, (model) => {
		const count = fn.EPDFForm_CountFields(model);
		for (let index = 0; index < count; index++) if (fn.EPDFForm_GetFieldFamily(model, index) === SIGNATURE && fn.EPDFForm_GetFieldValueKind(model, index) === VALUE_UNSUPPORTED) return true;
		return false;
	});
}
const failed = (name, why) => new EngineError("write-failed", `The form field "${name}" could not be set: ${why}.`);
const quoted = (values) => values.map((v) => `"${v}"`).join(", ");
/** Why `field` cannot hold `value`, or undefined when it can. */
function refusal(field, value) {
	if (!field) return "the form has no field by that name";
	if (field.objectNumber === 0) return "the field is not stored on its own in the file";
	const given = value.value;
	if (typeof given !== "string") {
		if (field.family !== LIST) return "it takes one string, not a list";
		if (value.text !== void 0) return "a list box shows no other text";
		if (given.length > 1 && (field.flags & MULTI_SELECT) === 0) return "the list box takes one option at most";
		const unknown = given.filter((v) => !field.options.includes(v));
		if (unknown.length > 0) return `the list box has no option ${quoted(unknown)}`;
		return;
	}
	switch (field.family) {
		case TEXT: return;
		case COMBO:
			if (given === "") return void 0;
			if ((field.flags & EDIT) === 0 && !field.options.includes(given)) return `the combo box has no option "${given}" and takes no text of its own`;
			return;
		case LIST: return "a list box takes a list of options";
		case CHECKBOX:
		case RADIO:
			if (value.text !== void 0) return "a button shows no other text";
			if (given !== OFF && !field.onStates.includes(given)) return `no button in it has the state "${given}"`;
			return;
		default: return "only text, checkbox, radio, combo and list fields take values";
	}
}
/** Writes the field's value, in the shape its family keeps it in. */
function setValue(heap, doc, field, value) {
	const values = field.family === COMBO && value.value === "" ? [] : typeof value.value === "string" ? [value.value] : [...value.value];
	const kind = values.length === 0 ? VALUE_NONE : values.length === 1 ? VALUE_SCALAR : VALUE_ARRAY;
	return withUtf16List(heap, values, (pointer, count) => Boolean(heap.fn.EPDFForm_SetFieldValue(doc, field.objectNumber, kind, pointer, count)));
}
/**
* Writes a choice field's /I, the selected options' positions, to match the value. A list box
* gets the positions of its values, in ascending order. A combo box gets none: /I is meant for
* several selections, and a stale one would contradict the value for readers that read it first.
*/
function setSelection(heap, doc, field, value) {
	return withInts(heap, field.family === LIST && typeof value.value !== "string" ? [...new Set(value.value.map((v) => field.options.indexOf(v)))].sort((a, b) => a - b) : [], (pointer, count) => Boolean(heap.fn.EPDFForm_SetFieldSelectedIndices(doc, field.objectNumber, count === 0 ? 0 : pointer, count)));
}
/** Draws the widgets: buttons by turning them on or off, the rest from the value or `text`. */
function draw(heap, doc, field, value) {
	const fn = heap.fn;
	const number = field.objectNumber;
	if (field.family === CHECKBOX || field.family === RADIO) return withInts(heap, field.onStates.map((state) => value.value !== OFF && state === value.value ? 1 : 0), (pointer, count) => Boolean(fn.EPDFForm_SetFieldWidgetsChecked(doc, number, pointer, count, 0, 0, 0)));
	if (value.text !== void 0) return withUtf16(heap, value.text, (pointer) => Boolean(fn.EPDFForm_SetFieldAppearanceText(doc, number, pointer, 0, 0, 0)));
	return Boolean(fn.EPDFForm_RedrawFieldWidgets(doc, number, 0, 0, 0));
}
/**
* Sets each field's value and draws its widgets. Every name and value is checked against the
* form before anything is written, so a refusal leaves the document untouched; a native setter
* that fails later leaves a partial write, which the caller discards.
*/
function writeFields(heap, doc, fields) {
	const entries = Object.entries(fields);
	if (entries.length === 0) return;
	const failure = () => new EngineError("write-failed", "The form could not be read.");
	const form = withModel(heap, doc, failure, (model) => readForm$1(heap, model));
	const planned = entries.map(([name, value]) => {
		const field = form.get(name);
		const why = refusal(field, value);
		if (why !== void 0) throw failed(name, why);
		return {
			name,
			value,
			field
		};
	});
	for (const { name, value, field } of planned) {
		if (!setValue(heap, doc, field, value)) throw failed(name, "the value was refused");
		if ((field.family === COMBO || field.family === LIST) && !setSelection(heap, doc, field, value)) throw failed(name, "its selection could not be written");
		if (!draw(heap, doc, field, value)) throw failed(name, "its widgets could not be drawn");
	}
}
//#endregion
//#region src/native/fonts.ts
/**
* Serves `bytes` as the font for `key` to text whose font is not in the file. The module copies
* them, so the copy made here is freed at once. False when the module refuses them. A key is
* registered once in a module's life: a second registration does not replace a font a loaded
* document already holds.
*/
function registerFont(heap, key, bytes) {
	const { fn, native } = heap;
	if (bytes.length === 0) return false;
	const pointer = fn.malloc(bytes.length);
	if (pointer === 0) throw new EngineError("out-of-memory", "The engine ran out of memory.");
	try {
		native.HEAPU8.set(bytes, pointer);
		return fn.INK_Fonts_Register(FONT_BITS[key], pointer, bytes.length) === 1;
	} finally {
		if (!heap.stopped) fn.free(pointer);
	}
}
/**
* The key bits a page needs for the fonts it names without embedding, registered or not: its
* own, those of the forms, patterns and Type 3 fonts it uses, and those of its annotations'
* appearances. Reads the file without loading any font.
*/
function pageNeeds(heap, doc, index) {
	return heap.fn.INK_Fonts_PageNeeds(doc, index);
}
//#endregion
//#region src/native/form.ts
const OPENED_AS = [
	"none",
	"user",
	"owner"
];
const FORM_KINDS = [
	"none",
	"acroform",
	"xfa"
];
const ORIGINS = ["acroform", "recovered"];
const FIELD_KINDS = [
	"text",
	"checkbox",
	"radio",
	"button",
	"combo",
	"list",
	"signature",
	"unknown"
];
const VALUE_KINDS = [
	"none",
	"string",
	"name",
	"array",
	"other"
];
/** The JSON `INK_Doc_Facts` returns. */
function parseDocumentFacts(text) {
	const what = "The document's facts";
	const root = object(parse(text, what), what, "root");
	const facts = {
		encrypted: boolean(root.encrypted, what, "encrypted"),
		openedAs: oneOf(OPENED_AS, root.openedAs, what, "openedAs")
	};
	if (facts.openedAs === "none" !== !facts.encrypted) throw bad(what, "openedAs", "none exactly when the file is not encrypted");
	if (present(root.title)) facts.title = fileText(root.title, what, "title");
	if (present(root.author)) facts.author = fileText(root.author, what, "author");
	if (onlyTrue(root.truncated, what, "truncated")) facts.truncated = true;
	return facts;
}
/** `/V` or `/DV`: its kind, and the value for a string, a name or a list. */
function value(item, kindKey, key, what) {
	const kind = oneOf(VALUE_KINDS, item[kindKey], what, kindKey);
	const raw = item[key];
	if (!(kind === "string" || kind === "name" || kind === "array")) {
		if (raw !== void 0) throw bad(what, key, `no value for ${kind}`);
		return { kind };
	}
	if (kind === "string") return {
		kind,
		value: fileText(raw, what, key)
	};
	if (kind === "name") {
		if (raw === null && item.truncated === true) return { kind };
		return {
			kind,
			value: name(raw, what, key)
		};
	}
	return {
		kind,
		value: array(raw, what, key).map((v) => listEntry(v, what, key))
	};
}
/**
* An entry of a `/V` or `/DV` list: text, `{ name }`, or `null` for any other entry (a name the
* report's budget could not take included, which marks the field `truncated`).
*/
function listEntry(raw, what, key) {
	if (raw === null) return null;
	if (typeof raw === "object" && !Array.isArray(raw) && "name" in raw) {
		if (Object.keys(raw).length !== 1) throw bad(what, key, "text, { name } or null");
		return { name: name(raw.name, what, key) };
	}
	return fileText(raw, what, key);
}
/** `/V`'s or `/DV`'s `valueNull`: `true` only beside a value of kind `none`. */
function nullValue(item, key, kind, what) {
	const isNull = onlyTrue(item[key], what, key);
	if (isNull && kind !== "none") throw bad(what, key, "true only for a value of kind none");
	return isNull;
}
const FILE_KINDS$1 = [
	"string",
	"spec",
	"other"
];
/**
* A Launch or GoToR action's `/F`, into `result`. In a cut widget (`cut`) the action's kind may
* be the empty name the budget left.
*/
function launchFile(item, result, what, cut) {
	const keys = [
		"fileKind",
		"fileHex",
		"fileSpecFHex",
		"fileSpecUFHex"
	];
	if (!present(item.fileKind)) {
		const stray = keys.find((k) => k in item);
		if (stray) throw bad(what, stray, "no file without fileKind");
		return;
	}
	const kindCut = cut && result.kind === "";
	if (result.kind !== "Launch" && result.kind !== "GoToR" && !kindCut) throw bad(what, "fileKind", "a file only in a Launch or GoToR action");
	const kind = oneOf(FILE_KINDS$1, item.fileKind, what, "fileKind");
	result.fileKind = kind;
	if (kind === "string") result.file = hexBytes(item.fileHex, what, "fileHex");
	else if ("fileHex" in item) throw bad(what, "fileHex", "bytes only for a string /F");
	for (const [key, out] of [["fileSpecFHex", "specFile"], ["fileSpecUFHex", "specUnicodeFile"]]) {
		if (!(key in item)) continue;
		if (kind !== "spec") throw bad(what, key, "bytes only for a file specification");
		result[out] = hexBytes(item[key], what, key);
	}
}
/**
* The widget's own action. `cut` says the widget is marked `truncated`: only then may the report
* write a name as `null`, which is left out. The keys the fork writes for a kind are kept when
* the kind itself was cut.
*/
function action$1(raw, what, cut) {
	const item = object(raw, what, "action");
	const result = { kind: cutName(item, "s", what, cut) ?? "" };
	if (present(item.uriHex)) result.uri = hexBytes(item.uriHex, what, "uriHex");
	if ("name" in item) {
		const named = cutName(item, "name", what, cut);
		if (named !== void 0) result.name = named;
	}
	launchFile(item, result, what, cut);
	if (result.kind === "ResetForm" || "fields" in item) result.reset = {
		fields: array(item.fields, what, "fields").map((f) => fileText(f, what, "fields")),
		refs: array(item.refs, what, "refs").map((r) => ref(r, what, "refs")),
		flags: number(item.flags, what, "flags")
	};
	return result;
}
/** Sources by key, the report's `Scripts`. */
function scripts(raw, what) {
	const item = object(raw, what, "scripts");
	return Object.fromEntries(Object.entries(item).map(([key, sources]) => [name(key, what, "scripts"), array(sources, what, "scripts").map((s) => string(s, what, "scripts"))]));
}
/** A checkbox's or radio's `/Opt`: entries as a value list's, or `null` when it is no list. */
function toggleOptions(raw, what, key) {
	return raw === null ? null : array(raw, what, key).map((v) => listEntry(v, what, key));
}
/** `/I`: numbers as written, each `null` when it is no number, or `null` when it is no list. */
const indices = (raw, what, key) => raw === null ? null : numbers(raw, what, key);
/** `t` and `parentIsWalkParent`, which the fork writes alike on groups, fields and kids. */
function nameFacts(item, what) {
	const facts = {};
	if ("t" in item) facts.partialName = item.t === null ? null : fileText(item.t, what, "t");
	if ("parentIsWalkParent" in item) {
		if (item.parentIsWalkParent !== false) throw bad(what, "parentIsWalkParent", "false or no key");
		facts.otherParent = true;
	}
	return facts;
}
/** An entry of `/Kids` or of `/Fields`. */
function treeEntry(raw, what, key) {
	const item = object(raw, what, key);
	const entry = {
		ref: item.ref === null ? null : ref(item.ref, what, "ref"),
		dictionary: boolean(item.dictionary, what, "dictionary")
	};
	const facts = [
		"hasT",
		"hasKids",
		"t",
		"parentIsWalkParent"
	];
	if (!entry.dictionary) {
		const stray = facts.find((k) => k in item);
		if (stray) throw bad(what, stray, "no facts for an entry that is no dictionary");
		return entry;
	}
	if (boolean(item.hasT, what, "hasT") !== "t" in item) throw bad(what, "t", "present exactly when hasT");
	return {
		...entry,
		hasKids: boolean(item.hasKids, what, "hasKids"),
		...nameFacts(item, what)
	};
}
function group(raw, what) {
	const item = object(raw, what, "groups");
	const entry = {
		name: string(item.name, what, "name"),
		...objectId(item, what),
		walkIndex: count(item.walkIndex, what, "walkIndex"),
		...nameFacts(item, what),
		kids: array(item.kids, what, "kids").map((k) => treeEntry(k, what, "kids")),
		scripts: scripts(item.scripts, what)
	};
	if (present(item.field)) entry.field = count(item.field, what, "field");
	if ("subtype" in item) {
		const subtype = cutName(item, "subtype", what);
		if (subtype !== void 0) entry.subtype = subtype;
	}
	for (const key of ["borderColor", "backgroundColor"]) if (present(item[key])) entry[key] = numbers(item[key], what, key);
	if ("rotation" in item) entry.rotation = numberOrNull(item.rotation, what, "rotation");
	if (present(item.caption)) entry.caption = fileText(item.caption, what, "caption");
	if ("rotate" in item) entry.rotate = numberOrNull(item.rotate, what, "rotate");
	if (present(item.page)) entry.page = indexOrNone(item.page, what, "page");
	if (onlyTrue(item.truncated, what, "truncated")) entry.truncated = true;
	return entry;
}
function widget(raw, what) {
	const item = object(raw, what, "widgets");
	const page = indexOrNone(item.page, what, "page");
	const index = indexOrNone(item.annotIndex, what, "annotIndex");
	if (page < 0 !== index < 0) throw bad(what, "annotIndex", "-1 exactly with page -1");
	const entry = {
		page,
		index,
		...objectId(item, what),
		...appearanceFacts(item, what),
		scripts: scripts(item.scripts, what)
	};
	if (present(item.onState)) entry.onState = name(item.onState, what, "onState");
	if (present(item.exportValue)) entry.exportValue = string(item.exportValue, what, "exportValue");
	for (const key of ["borderColor", "backgroundColor"]) if (present(item[key])) entry[key] = numbers(item[key], what, key);
	if ("rotation" in item) entry.rotation = numberOrNull(item.rotation, what, "rotation");
	if (present(item.caption)) entry.caption = fileText(item.caption, what, "caption");
	if ("rotate" in item) entry.rotate = numberOrNull(item.rotate, what, "rotate");
	if ("opt" in item) entry.toggleOptions = toggleOptions(item.opt, what, "opt");
	if ("selectedIndices" in item) entry.selectedIndices = indices(item.selectedIndices, what, "selectedIndices");
	if ("q" in item) entry.alignment = numberOrNull(item.q, what, "q");
	if (present(item.tooltip)) entry.tooltip = fileText(item.tooltip, what, "tooltip");
	if (present(item.da)) entry.defaultAppearance = fileText(item.da, what, "da");
	if (onlyTrue(item.pmd, what, "pmd")) entry.paperMetadata = true;
	if (present(item.action)) entry.action = action$1(item.action, what, item.truncated === true);
	if (onlyTrue(item.truncated, what, "truncated")) entry.truncated = true;
	return entry;
}
function field(raw, what) {
	const item = object(raw, what, "fields");
	const v = value(item, "valueKind", "value", what);
	const dv = value(item, "defaultValueKind", "defaultValue", what);
	const entry = {
		name: string(item.name, what, "name"),
		...objectId(item, what),
		origin: oneOf(ORIGINS, item.origin, what, "origin"),
		kind: oneOf(FIELD_KINDS, item.kind, what, "kind"),
		flags: number(item.flags, what, "flags"),
		valueKind: v.kind,
		defaultValueKind: dv.kind,
		widgets: array(item.widgets, what, "widgets").map((w) => widget(w, what))
	};
	if (v.value !== void 0) entry.value = v.value;
	if (nullValue(item, "valueNull", v.kind, what)) entry.valueNull = true;
	if (dv.value !== void 0) entry.defaultValue = dv.value;
	if (nullValue(item, "defaultValueNull", dv.kind, what)) entry.defaultValueNull = true;
	if ("selectedIndices" in item) {
		entry.selectedIndices = indices(item.selectedIndices, what, "selectedIndices");
		entry.selectedIndicesOwn = boolean(item.selectedIndicesOwn, what, "selectedIndicesOwn");
	} else if ("selectedIndicesOwn" in item) throw bad(what, "selectedIndicesOwn", "only beside selectedIndices");
	if ("opt" in item) entry.toggleOptions = toggleOptions(item.opt, what, "opt");
	if (present(item.walkIndex)) {
		entry.walkIndex = count(item.walkIndex, what, "walkIndex");
		Object.assign(entry, nameFacts(item, what));
	} else {
		const stray = ["t", "parentIsWalkParent"].find((k) => k in item);
		if (stray) throw bad(what, stray, "only beside walkIndex");
	}
	if (present(item.options)) entry.options = array(item.options, what, "options").map((raw) => {
		const option = object(raw, what, "options");
		return {
			exportValue: string(option.exportValue, what, "exportValue"),
			displayValue: string(option.displayValue, what, "displayValue")
		};
	});
	if (present(item.maxLength)) entry.maxLength = count(item.maxLength, what, "maxLength");
	if (present(item.topIndex)) entry.topIndex = number(item.topIndex, what, "topIndex");
	if (present(item.tooltip)) entry.tooltip = fileText(item.tooltip, what, "tooltip");
	if (onlyTrue(item.truncated, what, "truncated")) entry.truncated = true;
	return entry;
}
/** The JSON `INK_Form` returns. */
function parseForm(text) {
	const what = "The form";
	const root = object(parse(text, what), what, "root");
	const fields = array(root.fields, what, "fields").map((f) => field(f, what));
	const calculationOrder = array(root.calculationOrder, what, "calculationOrder").map((n) => indexOrNone(n, what, "calculationOrder"));
	if (calculationOrder.some((n) => n >= fields.length)) throw bad(what, "calculationOrder", "indexes of fields");
	const calculationOrderRefs = array(root.calculationOrderRefs, what, "calculationOrderRefs").map((r) => r === null ? null : ref(r, what, "calculationOrderRefs"));
	if (calculationOrderRefs.length !== calculationOrder.length) throw bad(what, "calculationOrderRefs", "one entry for each of calculationOrder");
	const tooLarge = boolean(root.tooLarge, what, "tooLarge");
	if (tooLarge && fields.length > 0) throw bad(what, "fields", "none when tooLarge");
	const groups = array(root.groups, what, "groups").map((g) => group(g, what));
	const fieldsRoot = array(root.fieldsRoot, what, "fieldsRoot").map((e) => treeEntry(e, what, "fieldsRoot"));
	if (tooLarge && groups.length + fieldsRoot.length > 0) throw bad(what, "groups", "none when tooLarge");
	const places = /* @__PURE__ */ new Set();
	for (const { walkIndex } of [...fields, ...groups.filter((g) => g.field === void 0)]) {
		if (walkIndex === void 0) continue;
		if (places.has(walkIndex)) throw bad(what, "walkIndex", "one place for each dictionary");
		places.add(walkIndex);
	}
	for (const g of groups) if (g.field !== void 0 && fields[g.field]?.walkIndex !== g.walkIndex) throw bad(what, "field", "the index of a field at the group's place in the walk");
	const form = {
		kind: oneOf(FORM_KINDS, root.kind, what, "kind"),
		needAppearances: boolean(root.needAppearances, what, "needAppearances"),
		fields,
		groups,
		fieldsRoot,
		calculationOrder,
		calculationOrderRefs,
		fieldTreeDepth: count(root.fieldTreeDepth, what, "fieldTreeDepth"),
		fieldTreeRevisits: boolean(root.fieldTreeRevisits, what, "fieldTreeRevisits"),
		tooLarge,
		truncated: boolean(root.truncated, what, "truncated")
	};
	if (present(root.da)) form.defaultAppearance = fileText(root.da, what, "da");
	if ("q" in root) form.alignment = numberOrNull(root.q, what, "q");
	return form;
}
/** The JSON `INK_Scripts` returns, for a document of `pageCount` pages. */
function parseScripts(text, pageCount) {
	const what = "The document's scripts";
	const root = object(parse(text, what), what, "root");
	return {
		document: array(root.document, what, "document").map((raw) => {
			const entry = object(raw, what, "document");
			return {
				name: entry.name === null ? null : fileText(entry.name, what, "name"),
				source: string(entry.source, what, "source")
			};
		}),
		documentActions: scripts(root.documentActions, what),
		pageActions: array(root.pageActions, what, "pageActions").map((raw, i, all) => {
			const entry = object(raw, what, "pageActions");
			const page = count(entry.page, what, "page");
			if (page >= pageCount) throw bad(what, "page", "a page of the document");
			const before = i > 0 ? all[i - 1].page : -1;
			if (typeof before === "number" && page <= before) throw bad(what, "page", "pages in order, each once");
			return {
				page,
				scripts: scripts(entry.scripts, what)
			};
		}),
		truncated: boolean(root.truncated, what, "truncated")
	};
}
function readScripts(heap, doc, pageCount) {
	return parseScripts(takeJson(heap, heap.fn.INK_Scripts(doc), "The document's scripts"), pageCount);
}
function readForm(heap, doc) {
	return parseForm(takeJson(heap, heap.fn.INK_Form(doc), "The form"));
}
function readDocumentFacts(heap, doc) {
	return parseDocumentFacts(takeJson(heap, heap.fn.INK_Doc_Facts(doc), "The document's facts"));
}
//#endregion
//#region src/native/functions.ts
const FUNCTIONS = {
	malloc: {
		args: ["i32"],
		ret: "ptr"
	},
	free: {
		args: ["ptr"],
		ret: "void"
	},
	INK_Init: {
		args: [],
		ret: "void"
	},
	INK_Destroy: {
		args: [],
		ret: "void"
	},
	INK_Save: {
		args: ["ptr", "i32"],
		ret: "ptr"
	},
	INK_WriterData: {
		args: ["ptr"],
		ret: "ptr"
	},
	INK_WriterSize: {
		args: ["ptr"],
		ret: "i32"
	},
	INK_WriterFree: {
		args: ["ptr"],
		ret: "void"
	},
	FPDF_LoadMemDocument64: {
		args: [
			"ptr",
			"i32",
			"ptr"
		],
		ret: "ptr"
	},
	FPDF_CloseDocument: {
		args: ["ptr"],
		ret: "void"
	},
	FPDF_GetLastError: {
		args: [],
		ret: "i32"
	},
	FPDF_GetPageCount: {
		args: ["ptr"],
		ret: "i32"
	},
	FPDF_LoadPage: {
		args: ["ptr", "i32"],
		ret: "ptr"
	},
	FPDF_ClosePage: {
		args: ["ptr"],
		ret: "void"
	},
	FPDF_GetPageWidthF: {
		args: ["ptr"],
		ret: "f32"
	},
	FPDF_GetPageHeightF: {
		args: ["ptr"],
		ret: "f32"
	},
	FPDFPage_GetRotation: {
		args: ["ptr"],
		ret: "i32"
	},
	FPDFBitmap_CreateEx: {
		args: [
			"i32",
			"i32",
			"i32",
			"ptr",
			"i32"
		],
		ret: "ptr"
	},
	FPDFBitmap_FillRect: {
		args: [
			"ptr",
			"i32",
			"i32",
			"i32",
			"i32",
			"i32"
		],
		ret: "i32"
	},
	FPDFBitmap_GetBuffer: {
		args: ["ptr"],
		ret: "ptr"
	},
	FPDFBitmap_GetStride: {
		args: ["ptr"],
		ret: "i32"
	},
	FPDFBitmap_Destroy: {
		args: ["ptr"],
		ret: "void"
	},
	FPDF_RenderPageBitmap: {
		args: [
			"ptr",
			"ptr",
			"i32",
			"i32",
			"i32",
			"i32",
			"i32",
			"i32"
		],
		ret: "void"
	},
	INK_Appearance_New: {
		args: [
			"ptr",
			"f32",
			"f32",
			"f32",
			"f32",
			"ptr",
			"i32",
			"i32"
		],
		ret: "ptr"
	},
	INK_Appearance_AddFont: {
		args: [
			"ptr",
			"ptr",
			"ptr"
		],
		ret: "i32"
	},
	INK_Appearance_AddOpacity: {
		args: [
			"ptr",
			"ptr",
			"f32",
			"f32"
		],
		ret: "i32"
	},
	INK_Appearance_AddImage: {
		args: [
			"ptr",
			"ptr",
			"i32",
			"ptr",
			"i32"
		],
		ret: "i32"
	},
	INK_Appearance_AddPage: {
		args: [
			"ptr",
			"ptr",
			"i32"
		],
		ret: "i32"
	},
	INK_Appearance_AddForm: {
		args: [
			"ptr",
			"ptr",
			"ptr"
		],
		ret: "i32"
	},
	INK_Appearance_Free: {
		args: ["ptr"],
		ret: "void"
	},
	INK_Annot_SetAppearance: {
		args: ["ptr", "ptr"],
		ret: "i32"
	},
	INK_Annot_SetData: {
		args: [
			"ptr",
			"ptr",
			"i32"
		],
		ret: "i32"
	},
	FPDF_GetPageBoundingBox: {
		args: ["ptr", "ptr"],
		ret: "i32"
	},
	EPDF_SetRuntimeOwnerPermissions: {
		args: ["ptr", "i32"],
		ret: "i32"
	},
	FPDFPage_CreateAnnot: {
		args: ["ptr", "i32"],
		ret: "ptr"
	},
	FPDFPage_CloseAnnot: {
		args: ["ptr"],
		ret: "void"
	},
	EPDFPage_GetAnnotByObjectNumber: {
		args: ["ptr", "i32"],
		ret: "ptr"
	},
	EPDFPage_RemoveAnnotByObjectNumber: {
		args: ["ptr", "i32"],
		ret: "i32"
	},
	EPDFAnnot_GetObjectNumber: {
		args: ["ptr"],
		ret: "i32"
	},
	FPDFAnnot_SetRect: {
		args: ["ptr", "ptr"],
		ret: "i32"
	},
	FPDFAnnot_SetFlags: {
		args: ["ptr", "i32"],
		ret: "i32"
	},
	FPDFAnnot_SetStringValue: {
		args: [
			"ptr",
			"ptr",
			"ptr"
		],
		ret: "i32"
	},
	FPDFAnnot_AppendAttachmentPoints: {
		args: ["ptr", "ptr"],
		ret: "i32"
	},
	FPDFAnnot_AddInkStroke: {
		args: [
			"ptr",
			"ptr",
			"i32"
		],
		ret: "i32"
	},
	FPDFAnnot_SetBorder: {
		args: [
			"ptr",
			"f32",
			"f32",
			"f32"
		],
		ret: "i32"
	},
	EPDFAnnot_SetBorderStyle: {
		args: [
			"ptr",
			"i32",
			"f32"
		],
		ret: "i32"
	},
	EPDFAnnot_SetBorderDashPattern: {
		args: [
			"ptr",
			"ptr",
			"i32"
		],
		ret: "i32"
	},
	EPDFAnnot_SetColor: {
		args: [
			"ptr",
			"i32",
			"i32",
			"i32",
			"i32"
		],
		ret: "i32"
	},
	EPDFAnnot_SetOpacity: {
		args: ["ptr", "f32"],
		ret: "i32"
	},
	EPDFAnnot_SetVertices: {
		args: [
			"ptr",
			"ptr",
			"i32"
		],
		ret: "i32"
	},
	EPDFAnnot_SetLine: {
		args: [
			"ptr",
			"ptr",
			"ptr"
		],
		ret: "i32"
	},
	EPDFAnnot_SetLineEndings: {
		args: [
			"ptr",
			"i32",
			"i32"
		],
		ret: "i32"
	},
	EPDFAnnot_SetIntent: {
		args: ["ptr", "ptr"],
		ret: "i32"
	},
	EPDFAnnot_SetCalloutLine: {
		args: [
			"ptr",
			"ptr",
			"i32"
		],
		ret: "i32"
	},
	EPDFAnnot_SetDefaultAppearance: {
		args: [
			"ptr",
			"i32",
			"f32",
			"i32",
			"i32",
			"i32"
		],
		ret: "i32"
	},
	EPDFAnnot_SetTextAlignment: {
		args: ["ptr", "i32"],
		ret: "i32"
	},
	EPDFAnnot_SetLinkedAnnot: {
		args: [
			"ptr",
			"ptr",
			"ptr"
		],
		ret: "i32"
	},
	EPDFAnnot_SetName: {
		args: ["ptr", "ptr"],
		ret: "i32"
	},
	EPDFForm_LoadModel: {
		args: ["ptr"],
		ret: "ptr"
	},
	EPDFForm_CloseModel: {
		args: ["ptr"],
		ret: "void"
	},
	EPDFForm_CountFields: {
		args: ["ptr"],
		ret: "i32"
	},
	EPDFForm_GetFieldObjNum: {
		args: ["ptr", "i32"],
		ret: "i32"
	},
	EPDFForm_GetFieldName: {
		args: [
			"ptr",
			"i32",
			"ptr",
			"i32"
		],
		ret: "i32"
	},
	EPDFForm_GetFieldFamily: {
		args: ["ptr", "i32"],
		ret: "i32"
	},
	EPDFForm_GetFieldFlags: {
		args: ["ptr", "i32"],
		ret: "i32"
	},
	EPDFForm_GetFieldValueKind: {
		args: ["ptr", "i32"],
		ret: "i32"
	},
	EPDFForm_CountFieldOptions: {
		args: ["ptr", "i32"],
		ret: "i32"
	},
	EPDFForm_GetFieldOptionValue: {
		args: [
			"ptr",
			"i32",
			"i32",
			"ptr",
			"i32"
		],
		ret: "i32"
	},
	EPDFForm_CountFieldWidgets: {
		args: ["ptr", "i32"],
		ret: "i32"
	},
	EPDFForm_GetFieldWidgetOnState: {
		args: [
			"ptr",
			"i32",
			"i32",
			"ptr",
			"i32"
		],
		ret: "i32"
	},
	EPDFForm_SetFieldValue: {
		args: [
			"ptr",
			"i32",
			"i32",
			"ptr",
			"i32"
		],
		ret: "i32"
	},
	EPDFForm_SetFieldSelectedIndices: {
		args: [
			"ptr",
			"i32",
			"ptr",
			"i32"
		],
		ret: "i32"
	},
	EPDFForm_SetFieldWidgetsChecked: {
		args: [
			"ptr",
			"i32",
			"ptr",
			"i32",
			"ptr",
			"i32",
			"ptr"
		],
		ret: "i32"
	},
	EPDFForm_RedrawFieldWidgets: {
		args: [
			"ptr",
			"i32",
			"ptr",
			"i32",
			"ptr"
		],
		ret: "i32"
	},
	EPDFForm_SetFieldAppearanceText: {
		args: [
			"ptr",
			"i32",
			"ptr",
			"ptr",
			"i32",
			"ptr"
		],
		ret: "i32"
	},
	EPDFPage_ApplyRedactions: {
		args: [
			"ptr",
			"ptr",
			"i32",
			"ptr"
		],
		ret: "i32"
	},
	FPDFPage_GenerateContent: {
		args: ["ptr"],
		ret: "i32"
	},
	INK_Redact_SetOverlay: {
		args: [
			"ptr",
			"ptr",
			"ptr"
		],
		ret: "i32"
	},
	INK_Redact_ApplyPage: {
		args: [
			"ptr",
			"ptr",
			"ptr",
			"i32",
			"i32",
			"ptr",
			"ptr"
		],
		ret: "i32"
	},
	INK_Redact_OwnLockedQuads: {
		args: [
			"ptr",
			"ptr",
			"ptr",
			"i32"
		],
		ret: "i32"
	},
	INK_Redact_Unremovable: {
		args: [
			"ptr",
			"i32",
			"ptr",
			"i32"
		],
		ret: "ptr"
	},
	INK_Sanitize: {
		args: [
			"ptr",
			"ptr",
			"ptr"
		],
		ret: "i32"
	},
	INK_Inspect_Page: {
		args: [
			"ptr",
			"i32",
			"ptr",
			"i32"
		],
		ret: "ptr"
	},
	INK_Inspect_File: {
		args: [
			"ptr",
			"ptr",
			"i32"
		],
		ret: "ptr"
	},
	INK_Inspect_Free: {
		args: ["ptr"],
		ret: "void"
	},
	INK_Render_Start: {
		args: [
			"ptr",
			"ptr",
			"i32",
			"i32",
			"i32",
			"i32",
			"i32",
			"i32",
			"ptr",
			"i32",
			"ptr",
			"i32"
		],
		ret: "ptr"
	},
	INK_Render_Continue: {
		args: ["ptr", "i32"],
		ret: "i32"
	},
	INK_Render_Close: {
		args: ["ptr"],
		ret: "void"
	},
	INK_Page_UserUnit: {
		args: ["ptr"],
		ret: "f32"
	},
	INK_Page_Facts: {
		args: [
			"ptr",
			"i32",
			"ptr"
		],
		ret: "i32"
	},
	INK_Fonts_Register: {
		args: [
			"i32",
			"ptr",
			"i32"
		],
		ret: "i32"
	},
	INK_Fonts_PageNeeds: {
		args: ["ptr", "i32"],
		ret: "i32"
	},
	INK_Fonts_TakeMisses: {
		args: [],
		ret: "i32"
	},
	INK_Text_Page: {
		args: ["ptr", "i32"],
		ret: "ptr"
	},
	INK_Text_Count: {
		args: ["ptr"],
		ret: "i32"
	},
	INK_Text_Codes: {
		args: ["ptr"],
		ret: "ptr"
	},
	INK_Text_Geometry: {
		args: ["ptr"],
		ret: "ptr"
	},
	INK_Text_Flags: {
		args: ["ptr"],
		ret: "ptr"
	},
	INK_Text_Fonts: {
		args: ["ptr"],
		ret: "ptr"
	},
	INK_Text_FontTable: {
		args: ["ptr"],
		ret: "ptr"
	},
	INK_Text_Truncated: {
		args: ["ptr"],
		ret: "i32"
	},
	INK_Text_Free: {
		args: ["ptr"],
		ret: "void"
	},
	INK_Links_Page: {
		args: ["ptr", "i32"],
		ret: "ptr"
	},
	INK_Outline: {
		args: ["ptr"],
		ret: "ptr"
	},
	INK_Dest_Named: {
		args: [
			"ptr",
			"ptr",
			"i32"
		],
		ret: "ptr"
	},
	INK_Annots_Page: {
		args: ["ptr", "i32"],
		ret: "ptr"
	},
	INK_Struct_Order: {
		args: ["ptr", "i32"],
		ret: "ptr"
	},
	INK_Annot_Draw: {
		args: [
			"ptr",
			"ptr",
			"i32",
			"ptr",
			"ptr"
		],
		ret: "i32"
	},
	INK_Form: {
		args: ["ptr"],
		ret: "ptr"
	},
	INK_Scripts: {
		args: ["ptr"],
		ret: "ptr"
	},
	INK_Doc_Facts: {
		args: ["ptr"],
		ret: "ptr"
	},
	INK_Json_Free: {
		args: ["ptr"],
		ret: "void"
	}
};
//#endregion
//#region src/redaction/verdict.ts
const presence = (count) => count > 0 ? "present" : "none";
function candidateOf(page, reports, region) {
	const { kind } = reports[0];
	const sum = (key) => reports.reduce((total, report) => total + report[key], 0);
	const left = Math.min(...reports.map((r) => r.rect[0]));
	const bottom = Math.min(...reports.map((r) => r.rect[1]));
	const right = Math.max(...reports.map((r) => r.rect[2]));
	const top = Math.max(...reports.map((r) => r.rect[3]));
	const text = presence(sum("textChars") + sum("annotationText") + sum("patternContent"));
	const image = presence(sum("imagesNotBlank") + sum("annotationImages"));
	const drawing = kind === "filled-box" || kind === "annotation-box" ? "none" : presence(sum("paths"));
	const found = text === "present" || image === "present" || drawing === "present";
	return {
		page,
		...region !== void 0 && { region },
		rect: {
			x: left,
			y: bottom,
			width: right - left,
			height: top - bottom
		},
		kind,
		text,
		image,
		drawing,
		verdict: !found ? "clean" : kind === "redact-annotation" ? "unapplied" : "content-remains"
	};
}
/** Turns the fork's reports into findings. Pure: it decides every verdict the check gives. */
function findingsFrom(pages, file) {
	return {
		candidates: pages.flatMap(({ page, candidates }) => candidates.map(({ reports, region }) => candidateOf(page, reports, region))),
		file: {
			earlierVersions: file.revisions - 1,
			metadata: file.info || file.xmp,
			attachments: file.attachments,
			scripts: file.scripts,
			hiddenLayers: file.hiddenLayers,
			signed: file.signed
		}
	};
}
//#endregion
//#region src/native/inspect.ts
const KINDS = /* @__PURE__ */ new Set([
	"region",
	"redact-annotation",
	"filled-box",
	"annotation-box"
]);
const COUNTS = [
	"textChars",
	"imagesNotBlank",
	"paths",
	"patternContent",
	"annotationText",
	"annotationImages"
];
const FILE_FLAGS = [
	"info",
	"xmp",
	"scripts",
	"hiddenLayers",
	"signed"
];
const isRecord$2 = (value) => typeof value === "object" && value !== null;
const isCount = (value) => typeof value === "number" && Number.isInteger(value) && value >= 0;
/**
* Reads a report the fork returned and frees it. A NULL report, one with no NUL, or one that is
* not the JSON object expected, throws `fail()`.
*/
function readReport(heap, report, fail) {
	if (report === 0) throw fail();
	try {
		const bytes = heap.native.HEAPU8;
		const end = bytes.indexOf(0, report);
		if (end < 0) throw fail();
		const text = new TextDecoder().decode(bytes.subarray(report, end));
		let parsed;
		try {
			parsed = JSON.parse(text);
		} catch (cause) {
			throw fail(cause);
		}
		if (!isRecord$2(parsed)) throw fail();
		return parsed;
	} finally {
		if (!heap.stopped) heap.fn.INK_Inspect_Free(report);
	}
}
/** The fork's report on what the file carries besides its pages. `data` holds its bytes. */
function inspectFile(heap, doc, data, size, fail) {
	const parsed = readReport(heap, heap.fn.INK_Inspect_File(doc, data, size), fail);
	const { revisions, attachments } = parsed;
	if (!isCount(revisions) || revisions < 1 || !isCount(attachments)) throw fail();
	return {
		revisions,
		attachments,
		...Object.fromEntries(FILE_FLAGS.map((key) => {
			const value = parsed[key];
			if (typeof value !== "boolean") throw fail();
			return [key, value];
		}))
	};
}
/** One entry of a page report, checked. */
function regionReport(value, fail) {
	if (!isRecord$2(value)) throw fail();
	const { rect, kind } = value;
	if (!Array.isArray(rect) || rect.length !== 4 || !rect.every((n) => typeof n === "number" && Number.isFinite(n)) || typeof kind !== "string" || !KINDS.has(kind)) throw fail();
	return {
		rect,
		kind,
		...Object.fromEntries(COUNTS.map((key) => {
			const count = value[key];
			if (!isCount(count)) throw fail();
			return [key, count];
		}))
	};
}
/** x1 y1 to x4 y4: upper left, upper right, lower left, lower right, as the fork takes them. */
const cornersOf = (quads) => quads.flatMap((q) => [
	q.p1.x,
	q.p1.y,
	q.p2.x,
	q.p2.y,
	q.p3.x,
	q.p3.y,
	q.p4.x,
	q.p4.y
]);
/**
* Asks the fork what lies on page `index`: under each quad of `regions`, or, without regions,
* under the candidates it finds. A page it could not inspect, or a report that does not match
* what was asked, is `check-failed`.
*/
function inspectPage(heap, doc, index, regions) {
	const fail = (cause) => new EngineError("check-failed", `Page ${index} could not be inspected.`, {
		page: index,
		cause
	});
	const corners = regions?.flatMap(({ quads }) => cornersOf(quads)) ?? [];
	const count = corners.length / 8;
	const parsed = readReport(heap, withFloats(heap, corners, (pointer) => heap.fn.INK_Inspect_Page(doc, index, count === 0 ? 0 : pointer, count)), fail);
	if (!Array.isArray(parsed.regions)) throw fail();
	const entries = parsed.regions.map((entry) => regionReport(entry, fail));
	if (!regions) {
		if (entries.some((entry) => entry.kind === "region")) throw fail();
		return {
			page: index,
			candidates: entries.map((entry) => ({ reports: [entry] }))
		};
	}
	if (entries.length !== count || entries.some((entry) => entry.kind !== "region")) throw fail();
	let next = 0;
	return {
		page: index,
		candidates: regions.map(({ region, quads }) => {
			const own = entries.slice(next, next + quads.length);
			next += quads.length;
			return {
				reports: own,
				region
			};
		})
	};
}
/**
* Checks a loaded document: the fork's report on the file, and on every page, or on each page
* `regions` name. `data` holds the file's bytes. Every region has at least one quad and a page
* index inside the document; the caller has checked.
*/
function inspectDocument(heap, doc, file, regions) {
	const fileReport = inspectFile(heap, doc, file.data, file.size, (cause) => new EngineError("check-failed", "The file could not be inspected.", { cause }));
	const pages = [];
	if (regions) {
		const byPage = groupByPage(regions.map(({ page, quads }, region) => ({
			page,
			region,
			quads
		})));
		for (const page of [...byPage.keys()].sort((a, b) => a - b)) pages.push(inspectPage(heap, doc, page, byPage.get(page)));
	} else for (let index = 0; index < file.pageCount; index++) pages.push(inspectPage(heap, doc, index, void 0));
	return findingsFrom(pages, fileReport);
}
/** `items` grouped by their page in one pass, each group in the order given. */
function groupByPage(items) {
	const out = /* @__PURE__ */ new Map();
	for (const item of items) {
		const group = out.get(item.page);
		if (group) group.push(item);
		else out.set(item.page, [item]);
	}
	return out;
}
//#endregion
//#region src/native/links.ts
/**
* A key the module writes on every action of its kind, as one of `values` or `null`. Absent, it
* comes from a module that does not write it, and is malformed.
*/
function kindOrNull(item, key, values, what) {
	if (!(key in item)) throw bad(what, key, `one of ${values.join(", ")} or null`);
	const value = item[key];
	return value === null ? void 0 : oneOf(values, value, what, key);
}
const ARG_KINDS = [
	"number",
	"null",
	"other"
];
const FIT_KINDS = [
	"name",
	"string",
	"other",
	"missing"
];
const PAGE_KINDS = [
	"ref",
	"integer",
	"other",
	"missing"
];
const URI_KINDS = ["string", "name"];
const FILE_KINDS = ["string", "spec"];
/** The fork reports the kinds of at most this many arguments. */
const MAX_ARG_KINDS = 8;
function destination(value, what) {
	const item = object(value, what, "dest");
	if (present(item.nameHex)) return { name: hexBytes(item.nameHex, what, "nameHex") };
	const args = array(item.args, what, "args").map((arg) => arg === null ? null : number(arg, what, "args"));
	const argCount = count(item.argCount, what, "argCount");
	const argKinds = array(item.argKinds, what, "argKinds").map((kind) => oneOf(ARG_KINDS, kind, what, "argKinds"));
	if (argKinds.length !== Math.min(argCount, MAX_ARG_KINDS)) throw bad(what, "argKinds", `${Math.min(argCount, MAX_ARG_KINDS)} entries`);
	const result = {
		page: number(item.page, what, "page"),
		fit: string(item.fit, what, "fit"),
		args,
		argCount,
		argKinds,
		argIndirect: boolean(item.argIndirect, what, "argIndirect"),
		fitKind: oneOf(FIT_KINDS, item.fitKind, what, "fitKind"),
		pageKind: oneOf(PAGE_KINDS, item.pageKind, what, "pageKind")
	};
	if (present(item.pageRef)) {
		const [objectNumber, generation, ...rest] = array(item.pageRef, what, "pageRef").map((n) => count(n, what, "pageRef"));
		if (objectNumber === void 0 || generation === void 0 || rest.length > 0) throw bad(what, "pageRef", "two numbers");
		result.pageRef = {
			objectNumber,
			generation
		};
	} else if (item.pageRef !== null) throw bad(what, "pageRef", "a list or null");
	return result;
}
function action(value, what) {
	const item = object(value, what, "action");
	const result = { kind: string(item.s, what, "s") };
	if (present(item.uriHex)) result.uri = hexBytes(item.uriHex, what, "uriHex");
	if (result.kind === "URI") {
		const uriKind = kindOrNull(item, "uriKind", URI_KINDS, what);
		if (uriKind) result.uriKind = uriKind;
	} else if (present(item.uriKind)) result.uriKind = oneOf(URI_KINDS, item.uriKind, what, "uriKind");
	if (present(item.dest)) result.destination = destination(item.dest, what);
	if (present(item.fileHex)) result.file = hexBytes(item.fileHex, what, "fileHex");
	if (result.kind === "GoToR" || result.kind === "Launch") {
		const fileKind = kindOrNull(item, "fileKind", FILE_KINDS, what);
		if (fileKind) result.fileKind = fileKind;
	} else if (present(item.fileKind)) result.fileKind = oneOf(FILE_KINDS, item.fileKind, what, "fileKind");
	if (present(item.newWindow)) result.newWindow = boolean(item.newWindow, what, "newWindow");
	if (present(item.name)) result.name = string(item.name, what, "name");
	if (present(item.js)) result.script = string(item.js, what, "js");
	if (onlyTrue(item.scriptTruncated, what, "scriptTruncated")) result.scriptTruncated = true;
	return result;
}
function target(item, what) {
	const result = {};
	if (present(item.dest)) result.destination = destination(item.dest, what);
	if (present(item.action)) result.action = action(item.action, what);
	if (present(item.aa)) result.additionalAction = action(item.aa, what);
	return result;
}
/** The JSON `INK_Links_Page` returns, as a page's annotations and links. */
function parsePageLinks(text) {
	const what = "A page's links";
	const root = object(parse(text, what), what, "root");
	return {
		annotations: array(root.annots, what, "annots").map((raw) => {
			const item = object(raw, what, "annots");
			const entry = {
				index: number(item.index, what, "index"),
				subtype: string(item.subtype, what, "subtype"),
				flags: number(item.flags, what, "flags"),
				rectOk: boolean(item.rectOk, what, "rectOk"),
				hasQuads: boolean(item.hasQuads, what, "hasQuads"),
				quadsOk: boolean(item.quadsOk, what, "quadsOk")
			};
			const objectNumber = number(item.obj, what, "obj");
			const generation = count(item.generation, what, "generation");
			if (objectNumber !== 0) {
				entry.objectNumber = objectNumber;
				entry.generation = generation;
			} else if (generation !== 0) throw bad(what, "generation", "0 for a direct object");
			return entry;
		}),
		links: array(root.links, what, "links").map((raw) => {
			const item = object(raw, what, "links");
			const [left, bottom, right, top] = array(item.rect, what, "rect").map((n) => number(n, what, "rect"));
			if (left === void 0 || bottom === void 0 || right === void 0 || top === void 0) throw bad(what, "rect", "four numbers");
			const link = {
				index: number(item.index, what, "index"),
				rect: {
					x: left,
					y: bottom,
					width: right - left,
					height: top - bottom
				},
				...target(item, what)
			};
			if (present(item.quads)) link.quads = array(item.quads, what, "quads").map((n) => number(n, what, "quads"));
			if (onlyTrue(item.destInvalid, what, "destInvalid")) {
				if (link.destination) throw bad(what, "destInvalid", "no destination beside it");
				link.destinationInvalid = true;
			}
			return link;
		})
	};
}
/** The JSON `INK_Outline` returns, nested by each item's depth. */
function parseOutline(text) {
	const what = "The outline";
	const root = object(parse(text, what), what, "root");
	const truncated = boolean(root.truncated, what, "truncated");
	const items = [];
	const stack = [];
	for (const raw of array(root.items, what, "items")) {
		const item = object(raw, what, "items");
		const depth = count(item.depth, what, "depth");
		const flags = number(item.flags, what, "flags");
		const entry = {
			title: string(item.title, what, "title"),
			bold: (flags & 2) !== 0,
			italic: (flags & 1) !== 0,
			count: number(item.count, what, "count"),
			children: [],
			...target(item, what)
		};
		while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
		const parent = stack[stack.length - 1];
		if (parent) parent.entry.children.push(entry);
		else items.push(entry);
		stack.push({
			depth,
			entry
		});
	}
	return {
		items,
		truncated
	};
}
/** The JSON `INK_Dest_Named` returns: a destination, or `null` for a name the file lacks. */
function parseNamedDestination(text) {
	const what = "A named destination";
	const root = parse(text, what);
	return root === null ? void 0 : destination(root, what);
}
function readPageLinks(heap, doc, index) {
	return parsePageLinks(takeJson(heap, heap.fn.INK_Links_Page(doc, index), "A page's links"));
}
function readOutline(heap, doc) {
	return parseOutline(takeJson(heap, heap.fn.INK_Outline(doc), "The outline"));
}
function readNamedDestination(heap, doc, name) {
	return parseNamedDestination(withBytes(heap, name, (pointer, length) => takeJson(heap, heap.fn.INK_Dest_Named(doc, pointer, length), "A named destination")));
}
//#endregion
//#region src/native/redact.ts
/** What sanitising found, as the fork's flags. */
const SANITISED = {
	metadata: 1,
	attachments: 2,
	scripts: 4,
	thumbnails: 8,
	privateData: 16
};
/** The regions a mark removes: its Gloss quads, or its rectangle when it has none. */
function regionsOf(item) {
	const { annotation } = item;
	const quads = annotation.type === "redact" ? annotation.quads : void 0;
	if (quads && quads.length > 0) return {
		corners: quads.map((q) => [
			q.p1.x,
			q.p1.y,
			q.p2.x,
			q.p2.y,
			q.p3.x,
			q.p3.y,
			q.p4.x,
			q.p4.y
		]),
		fromRect: false
	};
	const { x, y, width, height } = annotation.rect;
	return {
		corners: [[
			x,
			y + height,
			x + width,
			y + height,
			x,
			y,
			x + width,
			y
		]],
		fromRect: true
	};
}
/** Whether a region has an area that meets the inside of `box`. */
function reaches(corners, box) {
	const [x1, y1, x2, y2, x3, y3, x4, y4] = corners;
	const xs = [
		x1,
		x2,
		x3,
		x4
	];
	const ys = [
		y1,
		y2,
		y3,
		y4
	];
	return Math.max(...xs) > Math.min(...xs) && Math.max(...ys) > Math.min(...ys) && Math.max(...xs) > box.x && Math.min(...xs) < box.x + box.width && Math.max(...ys) > box.y && Math.min(...ys) < box.y + box.height;
}
/**
* Whether a mark is skipped: every region it has lacks an area or lies wholly outside the page
* box. A mark with a number that is not finite is not skipped, so writing it reports the fault.
*/
function skipped(item, box) {
	const { corners } = regionsOf(item);
	return corners.every((c) => c.every(Number.isFinite) && !reaches(c, box));
}
/**
* The most quads of earlier marks read from one page. The count comes from the file, and an
* encrypted file is not ours to trust: each quad takes 32 bytes to read, so a count with no cap
* could ask for hundreds of megabytes. No page Inkbar marked needs anywhere near this many.
*/
const MAX_LOCKED_QUADS_PER_PAGE = 1e4;
/**
* The quads of the Redact annotations on `page` that carry Inkbar's data: its earlier marks in
* an encrypted file, read before the apply removes them. A failure, or more quads than
* `MAX_LOCKED_QUADS_PER_PAGE`, is `redaction-failed` naming the page.
*/
function ownLockedQuads(heap, doc, page, index) {
	const { fn } = heap;
	const failed = () => new EngineError("redaction-failed", `The earlier marks on page ${index} could not be read.`, { page: index });
	const count = fn.INK_Redact_OwnLockedQuads(doc, page, 0, 0);
	if (count < 0 || count > MAX_LOCKED_QUADS_PER_PAGE) throw failed();
	if (count === 0) return [];
	return withFloats(heap, new Array(count * 8).fill(0), (out) => {
		if (fn.INK_Redact_OwnLockedQuads(doc, page, out, count) !== count) throw failed();
		const floats = heap.native.HEAPF32.slice(out / 4, out / 4 + count * 8);
		return Array.from({ length: count }, (_, i) => {
			const [x1, y1, x2, y2, x3, y3, x4, y4] = floats.subarray(i * 8, i * 8 + 8);
			return {
				p1: {
					x: x1,
					y: y1
				},
				p2: {
					x: x2,
					y: y2
				},
				p3: {
					x: x3,
					y: y3
				},
				p4: {
					x: x4,
					y: y4
				}
			};
		});
	});
}
/** The fork's counts, by the kind of content each one is. */
const UNREMOVABLE = [
	["patterns", "pattern"],
	["shadings", "shading"],
	["maskGroups", "mask-group"],
	["glyphs", "glyph"]
];
/**
* Asks the fork what lies under each quad on page `index` that the apply cannot remove, on the
* page as it is. Returns the kinds found under each quad, in order. A page it could not look at,
* or a report that does not match what was asked, is `redaction-failed` with `reason:
* 'could-not-inspect'`.
*/
function unremovableUnder(heap, doc, index, quads) {
	const fail = (cause) => new EngineError("redaction-failed", `What lies under the marks on page ${index} could not be inspected.`, {
		page: index,
		reason: "could-not-inspect",
		cause
	});
	const { regions } = readReport(heap, withFloats(heap, quads.flat(), (pointer) => heap.fn.INK_Redact_Unremovable(doc, index, pointer, quads.length)), fail);
	if (!Array.isArray(regions) || regions.length !== quads.length) throw fail();
	return regions.map((entry, i) => {
		if (!isRecord$2(entry) || entry.index !== i) throw fail();
		const kinds = /* @__PURE__ */ new Set();
		for (const [key, kind] of UNREMOVABLE) {
			const count = entry[key];
			if (!isCount(count)) throw fail();
			if (count > 0) kinds.add(kind);
		}
		return kinds;
	});
}
/**
* Refuses, before anything changes, marks over content the apply cannot remove: on every page
* with marks it applies, the marks' regions, and on every page of an encrypted file, Inkbar's
* earlier locked marks. Every offending mark on every page is named in one `redaction-failed`
* with `reason: 'unremovable-content'`.
*/
function refuseUnremovable(heap, doc, marksByPage, context, withPage) {
	const marks = [];
	const kinds = /* @__PURE__ */ new Set();
	let first;
	for (let index = 0; index < context.pageCount; index++) {
		const given = marksByPage.get(index) ?? [];
		if (given.length === 0 && !context.encrypted) continue;
		const asked = withPage(index, (page) => {
			const box = context.pageBox(page);
			const owners = [];
			const quads = [];
			for (const item of given) {
				if (skipped(item, box)) continue;
				for (const corners of regionsOf(item).corners) {
					owners.push(item.annotation.id);
					quads.push(corners);
				}
			}
			if (context.encrypted) for (const q of ownLockedQuads(heap, doc, page, index)) {
				owners.push(void 0);
				quads.push([
					q.p1.x,
					q.p1.y,
					q.p2.x,
					q.p2.y,
					q.p3.x,
					q.p3.y,
					q.p4.x,
					q.p4.y
				]);
			}
			return {
				owners,
				quads
			};
		});
		if (asked.quads.length === 0) continue;
		unremovableUnder(heap, doc, index, asked.quads).forEach((under, i) => {
			if (under.size === 0) return;
			first ??= index;
			for (const kind of under) kinds.add(kind);
			const id = asked.owners[i];
			if (id !== void 0 && !marks.includes(id)) marks.push(id);
		});
	}
	if (first === void 0) return;
	throw new EngineError("redaction-failed", marks.length > 0 ? `The marks ${marks.join(", ")} lie over content the redaction cannot remove.` : `Earlier marks on page ${first} lie over content the redaction cannot remove.`, {
		page: first,
		reason: "unremovable-content",
		marks,
		kinds: UNREMOVABLE.map(([, kind]) => kind).filter((kind) => kinds.has(kind))
	});
}
/** Runs `use` with two zeroed 32-bit outputs, and returns its result with their values. */
function withOutputs(heap, use) {
	return withInts(heap, [0, 0], (out) => {
		const value = use(out, out + 4);
		const view = new DataView(heap.native.HEAPU8.buffer, heap.native.HEAPU8.byteOffset);
		return {
			value,
			first: view.getUint32(out, true),
			second: view.getUint32(out + 4, true)
		};
	});
}
/**
* Writes one mark on `page` and returns its handle, which the caller closes: the annotation as
* `write` writes it, its regions as /QuadPoints, and its appearance as the overlay the apply
* leaves in its place. A failure is `redaction-failed` naming the page and the mark.
*/
function writeMark(heap, doc, page, item) {
	const { fn } = heap;
	const id = item.annotation.id;
	const failed = (what, cause) => new EngineError("redaction-failed", `The mark ${id} on page ${item.page} could not be written: ${what}`, {
		page: item.page,
		annotation: id,
		cause
	});
	if (item.annotation.type !== "redact") throw failed(`its type ${String(item.annotation.type)} is not redact.`);
	let annot;
	try {
		annot = writeAnnotation(heap, doc, page, item, /* @__PURE__ */ new Map());
	} catch (error) {
		if (error instanceof EngineError && error.code === "write-failed") throw failed(error.message, error);
		throw error;
	}
	try {
		const { corners, fromRect } = regionsOf(item);
		if (fromRect) {
			for (const quad of corners) if (!withFloats(heap, quad, (q) => fn.FPDFAnnot_AppendAttachmentPoints(annot, q))) throw failed("its /QuadPoints could not be set.");
		}
		const overlay = buildAppearance(heap, doc, item.appearance, (what) => failed(`${what}.`));
		if (!fn.INK_Redact_SetOverlay(doc, annot, overlay)) throw failed("its overlay could not be set.");
		return annot;
	} catch (error) {
		if (!heap.stopped) fn.FPDFPage_CloseAnnot(annot);
		throw error;
	}
}
/**
* Applies the marks of `input` to `doc` and sanitises it, in order: removes `remove`, writes
* the marks, applies them page by page, writes `annotations`, writes the `fields` whose widgets
* survive, and sanitises. Every page is visited, to count other programs' marks and, in an
* encrypted file, to apply Inkbar's earlier locked ones. A failure leaves the document partly
* changed, so the caller discards it.
*/
function applyRedactions(heap, doc, input, context) {
	const { fn } = heap;
	const file = inspectFile(heap, doc, context.data, context.size, (cause) => new EngineError("redaction-failed", "The file could not be inspected.", { cause }));
	const fields = Object.entries(input.fields ?? {});
	const fieldsBefore = fields.length > 0 ? formFieldNames(heap, doc) : /* @__PURE__ */ new Set();
	const loadPage = (index) => {
		const page = fn.FPDF_LoadPage(doc, index);
		if (page === 0) throw new EngineError("redaction-failed", `Page ${index} could not be loaded.`, {
			page: index,
			pdfiumError: fn.FPDF_GetLastError()
		});
		return page;
	};
	const withPage = (index, use) => {
		const page = loadPage(index);
		try {
			return use(page);
		} finally {
			if (!heap.stopped) fn.FPDF_ClosePage(page);
		}
	};
	const marksByPage = groupByPage(input.marks);
	refuseUnremovable(heap, doc, marksByPage, context, withPage);
	for (const [index, refs] of groupByPage(input.remove ?? [])) withPage(index, (page) => {
		for (const ref of refs) if (!fn.EPDFPage_RemoveAnnotByObjectNumber(page, ref.objectNumber)) throw new EngineError("redaction-failed", `The annotation in object ${ref.objectNumber} on page ${index} could not be removed.`, { page: index });
	});
	/** INK_Redact_ApplyPage: its result, the annotations it removed, the Redacts it left. */
	const applyPage = (page, marks, ownLocked) => withInts(heap, marks, (pointer, count) => withOutputs(heap, (removed, left) => fn.INK_Redact_ApplyPage(doc, page, count === 0 ? 0 : pointer, count, ownLocked ? 1 : 0, removed, left)));
	const pages = [];
	let ownLockedMarks = 0;
	const ownLockedRegions = [];
	let foreignMarks = 0;
	for (let index = 0; index < context.pageCount; index++) withPage(index, (page) => {
		const box = context.pageBox(page);
		const earlier = context.encrypted ? ownLockedQuads(heap, doc, page, index) : [];
		const marks = (marksByPage.get(index) ?? []).filter((item) => !skipped(item, box));
		const handles = [];
		try {
			for (const item of marks) handles.push(writeMark(heap, doc, page, item));
			const before = context.encrypted ? applyPage(page, [], false).second : 0;
			const applied = applyPage(page, handles, context.encrypted);
			if (applied.value < 0) throw new EngineError("redaction-failed", `The marks on page ${index} could not be applied.`, { page: index });
			foreignMarks += applied.second;
			if (applied.value === 1) {
				const own = context.encrypted ? before - applied.second - handles.length : 0;
				if (own > 0 && earlier.length === 0) throw new EngineError("redaction-failed", `What the earlier marks on page ${index} removed could not be inspected.`, {
					page: index,
					reason: "could-not-inspect"
				});
				ownLockedMarks += own;
				if (own > 0) ownLockedRegions.push({
					page: index,
					quads: earlier
				});
				pages.push({
					page: index,
					marks: handles.length + own,
					annotationsRemoved: applied.first
				});
			}
		} finally {
			if (!heap.stopped) for (const annot of handles) fn.FPDFPage_CloseAnnot(annot);
		}
	});
	context.writeAnnotations(input.annotations ?? []);
	const fieldsSkipped = [];
	if (fields.length > 0) {
		const fieldsAfter = formFieldNames(heap, doc);
		const kept = fields.filter(([name]) => {
			const gone = fieldsBefore.has(name) && !fieldsAfter.has(name);
			if (gone) fieldsSkipped.push(name);
			return !gone;
		});
		writeFields(heap, doc, Object.fromEntries(kept));
	}
	const sanitised = withOutputs(heap, (flags, attachments) => fn.INK_Sanitize(doc, flags, attachments));
	if (!sanitised.value) throw new EngineError("redaction-failed", "The file could not be sanitised.");
	const flags = sanitised.first;
	return {
		pages,
		ownLockedMarks,
		ownLockedRegions,
		foreignMarks,
		fieldsSkipped,
		sanitised: {
			metadata: (flags & SANITISED.metadata) !== 0,
			attachments: sanitised.second,
			scripts: (flags & SANITISED.scripts) !== 0,
			thumbnails: (flags & SANITISED.thumbnails) !== 0,
			privateData: (flags & SANITISED.privateData) !== 0
		},
		hiddenLayers: file.hiddenLayers,
		signed: file.signed
	};
}
//#endregion
//#region src/native/render.ts
const MAX_PIXELS = 268435456;
/** The bound on any placement number, well inside the 32-bit integers the module takes. */
const MAX_PLACEMENT = 2 ** 30;
const MAX_OBJECT_NUMBER = 2 ** 32 - 1;
const ANGLES = [
	0,
	90,
	180,
	270
];
/** Quarter turns for an angle of 0, 90, 180 or 270 degrees, or undefined for anything else. */
const quarterTurns = (angle) => {
	const turns = ANGLES.indexOf(angle);
	return turns < 0 ? void 0 : turns;
};
const isRecord$1 = (value) => typeof value === "object" && value !== null;
const finite$1 = (n) => typeof n === "number" && Number.isFinite(n);
/**
* The left and top of `region`, in points from the top-left corner of the page as displayed
* after `turns` quarter turns clockwise, with the region's displayed width and height.
*/
function displayed(box, region, turns) {
	const fromLeft = region.x - box.x;
	const fromBottom = region.y - box.y;
	const fromRight = box.x + box.width - (region.x + region.width);
	const fromTop = box.y + box.height - (region.y + region.height);
	const { width, height } = region;
	switch (turns) {
		case 1: return {
			left: fromBottom,
			top: fromLeft,
			width: height,
			height: width
		};
		case 2: return {
			left: fromRight,
			top: fromBottom,
			width,
			height
		};
		case 3: return {
			left: fromTop,
			top: fromRight,
			width: height,
			height: width
		};
		default: return {
			left: fromLeft,
			top: fromTop,
			width,
			height
		};
	}
}
/**
* The bitmap size and the page's placement in it for a render of `page` with `options`. Pure.
* Sizes are in user-space units, as `page` gives them. Throws a `RangeError` for a bad scale,
* size, region or rotation, or a bitmap over 268,435,456 pixels.
*/
function renderGeometry(page, options) {
	const { scale, size, region = page.box, rotation = 0 } = options;
	if (scale !== void 0 && size !== void 0) throw new ArgumentError("pass scale or size, not both");
	if (scale !== void 0 && (!finite$1(scale) || scale <= 0)) throw new ArgumentError("scale must be a finite number above 0");
	if (size !== void 0 && (!isRecord$1(size) || !Number.isInteger(size.width) || !Number.isInteger(size.height) || size.width < 1 || size.height < 1)) throw new ArgumentError("size must have a width and height that are whole numbers from 1");
	if (!isRecord$1(region) || !finite$1(region.x) || !finite$1(region.y) || !finite$1(region.width) || !finite$1(region.height) || region.width <= 0 || region.height <= 0) throw new ArgumentError("region must have a finite x and y, and a finite width and height above 0");
	const rotate = quarterTurns(rotation);
	if (rotate === void 0) throw new ArgumentError("rotation must be 0, 90, 180 or 270");
	const turns = (quarterTurns(page.rotation) ?? 0) + rotate;
	const area = displayed(page.box, region, turns % 4);
	const pageWidth = turns % 2 === 0 ? page.width : page.height;
	const pageHeight = turns % 2 === 0 ? page.height : page.width;
	let width, height, sizeX, sizeY, xScale, yScale;
	if (size === void 0) {
		xScale = yScale = scale ?? 1;
		width = Math.ceil(area.width * xScale);
		height = Math.ceil(area.height * yScale);
		sizeX = Math.ceil(pageWidth * xScale);
		sizeY = Math.ceil(pageHeight * yScale);
	} else {
		({width, height} = size);
		xScale = width / area.width;
		yScale = height / area.height;
		sizeX = Math.round(pageWidth * xScale);
		sizeY = Math.round(pageHeight * yScale);
	}
	const startX = 0 - Math.round(area.left * xScale);
	const startY = 0 - Math.round(area.top * yScale);
	if (width < 1 || height < 1 || width * height > MAX_PIXELS) throw new ArgumentError("the rendered page would be too large");
	if ([
		startX,
		startY,
		sizeX,
		sizeY
	].some((n) => !(Math.abs(n) <= MAX_PLACEMENT))) throw new ArgumentError(size === void 0 ? "the page lies too far from the region, or is too large at this scale" : "the region is too small for the size asked");
	if (sizeX < 1 || sizeY < 1) throw new ArgumentError(size === void 0 ? "the scale is too small to draw the page" : "the region is too large for the size asked");
	return {
		width,
		height,
		startX,
		startY,
		sizeX,
		sizeY,
		rotate
	};
}
/** The largest place in `/Annots` the module takes: it reads places as 32-bit integers. */
const MAX_PLACE = 2 ** 31 - 1;
const isPlace = (n) => Number.isInteger(n) && n >= 0 && n <= MAX_PLACE;
/**
* The annotations to leave out, checked and split by how each is named. Throws a `RangeError`
* for a list that is not one of object numbers (whole numbers from 1 to 4,294,967,295) and
* places (`{ index }`, a whole number from 0 to 2,147,483,647), or that is longer than
* `MAX_HIDDEN`.
*/
function hiddenAnnotations(hide) {
	const hidden = {
		objects: [],
		places: []
	};
	if (hide === void 0) return hidden;
	if (Array.isArray(hide) && hide.length > 1e6) throw new ArgumentError("hide may list at most 1,000,000 annotations");
	if (!Array.isArray(hide)) throw new ArgumentError("hide must be a list of object numbers and places");
	for (const item of hide) if (Number.isInteger(item) && item >= 1 && item <= MAX_OBJECT_NUMBER) hidden.objects.push(item);
	else if (isRecord$1(item) && isPlace(item.index)) hidden.places.push(item.index);
	else throw new ArgumentError("hide must list object numbers, whole numbers from 1, and places, { index } with a whole number from 0");
	return hidden;
}
/**
* The longest state name `renderAnnotations` takes, in bytes. PDF 1.7 (Annex C) limits a name to
* 127 bytes; this leaves room for files past that limit while keeping a name a small copy.
*/
const MAX_STATE_BYTES = 65535;
/**
* The annotations `renderAnnotations` draws, checked. Throws a `RangeError` for a list that is
* not one of `{ index, state? }`, with a place as `hide` takes it and a state of 1 to
* `MAX_STATE_BYTES` characters from U+0001 to U+00FF, or that is longer than `MAX_HIDDEN`.
*/
function annotationDraws(annotations) {
	if (!Array.isArray(annotations)) throw new ArgumentError("annotations must be a list of { index, state? }");
	if (annotations.length > 1e6) throw new ArgumentError("annotations may list at most 1,000,000 entries");
	return annotations.map((item, i) => {
		if (!isRecord$1(item) || !isPlace(item.index)) throw new ArgumentError(`annotation ${i}: index must be a whole number from 0 to 2,147,483,647`);
		const { state } = item;
		if (state === void 0) return { index: item.index };
		if (typeof state === "string" && state.length > 65535) throw new ArgumentError(`annotation ${i}: state may be at most ${MAX_STATE_BYTES.toLocaleString("en")} characters`);
		if (typeof state !== "string" || !/^[\u0001-\u00ff]+$/.test(state)) throw new ArgumentError(`annotation ${i}: state must be a name of one or more characters from U+0001 to U+00FF`);
		const bytes = new Uint8Array(state.length + 1);
		for (let c = 0; c < state.length; c++) bytes[c] = state.charCodeAt(c);
		return {
			index: item.index,
			state: bytes
		};
	});
}
/**
* The matrix the module's annotation draw takes, which it applies after the page's display
* matrix, for the same placement as a render with `geometry`. The display matrix takes the page
* to `width` by `height` points (its size after /Rotate), top left at the origin; a render maps
* the page onto the rectangle `startX`, `startY`, `sizeX`, `sizeY` turned `rotate` quarters, as
* PDFium's `GetDisplayMatrixForRect` does. The result undoes the first and applies the second.
*/
function annotationMatrix(geometry, width, height) {
	const left = geometry.startX;
	const right = geometry.startX + geometry.sizeX;
	const bottom = geometry.startY;
	const top = geometry.startY + geometry.sizeY;
	const [x0, y0, x1, y1, x2, y2] = [
		[
			left,
			top,
			left,
			bottom,
			right,
			top
		],
		[
			left,
			bottom,
			right,
			bottom,
			left,
			top
		],
		[
			right,
			bottom,
			right,
			top,
			left,
			bottom
		],
		[
			right,
			top,
			left,
			top,
			right,
			bottom
		]
	][geometry.rotate];
	const a = (x2 - x0) / width;
	const b = (y2 - y0) / width;
	const c = (x1 - x0) / height;
	const d = (y1 - y0) / height;
	return [
		a,
		b,
		-c,
		-d,
		height * c + x0,
		height * d + y0
	];
}
//#endregion
//#region src/native/text.ts
const FONT_KEYS = [
	"fixedPitch",
	"serif",
	"italic",
	"bold",
	"vertical"
];
const METRIC_KEYS = [
	"ascent",
	"descent",
	"descriptorAscent",
	"descriptorDescent"
];
const STANDARD_FONTS = /* @__PURE__ */ new Set([
	"Courier",
	"Courier-Bold",
	"Courier-BoldOblique",
	"Courier-Oblique",
	"Helvetica",
	"Helvetica-Bold",
	"Helvetica-BoldOblique",
	"Helvetica-Oblique",
	"Times-Roman",
	"Times-Bold",
	"Times-BoldItalic",
	"Times-Italic",
	"Symbol",
	"ZapfDingbats"
]);
const finiteOrNull = (value) => value === null || typeof value === "number" && Number.isFinite(value);
function fail(message, cause) {
	return new EngineError("engine-failure", message, cause === void 0 ? {} : { cause });
}
/** The font table the fork wrote, checked: an array of the eleven-key objects. */
function readFontTable(heap, pointer) {
	const bytes = heap.native.HEAPU8;
	const end = pointer === 0 ? -1 : bytes.indexOf(0, pointer);
	if (end < 0) throw fail("A page's font table could not be read.");
	let parsed;
	try {
		parsed = JSON.parse(new TextDecoder().decode(bytes.subarray(pointer, end)));
	} catch (cause) {
		throw fail("A page's font table could not be read.", cause);
	}
	const bad = (key, expected) => fail("A page's font table could not be read.", /* @__PURE__ */ new Error(`${key}: expected ${expected}`));
	if (!Array.isArray(parsed)) throw bad("root", "a list");
	return parsed.map((entry) => {
		if (typeof entry !== "object" || entry === null) throw bad("entry", "an object");
		const item = entry;
		if (typeof item.name !== "string") throw bad("name", "a string");
		const flag = FONT_KEYS.find((k) => typeof item[k] !== "boolean");
		if (flag) throw bad(flag, "a boolean");
		const metric = METRIC_KEYS.find((k) => !finiteOrNull(item[k]));
		if (metric) throw bad(metric, "a finite number or null");
		if (!(item.standard === null || STANDARD_FONTS.has(item.standard))) throw bad("standard", "a standard 14 font name or null");
		return {
			name: item.name,
			fixedPitch: item.fixedPitch,
			serif: item.serif,
			italic: item.italic,
			bold: item.bold,
			vertical: item.vertical,
			ascent: item.ascent,
			descent: item.descent,
			descriptorAscent: item.descriptorAscent,
			descriptorDescent: item.descriptorDescent,
			standard: item.standard
		};
	});
}
/**
* A page's characters, copied out of engine memory. Every array owns its buffer, so none is a
* view on the module's memory, which can grow or be reused. The fork's block is freed after.
*/
function readPageText(heap, doc, index) {
	const { fn, native } = heap;
	const text = fn.INK_Text_Page(doc, index);
	if (text === 0) throw new EngineError("engine-failure", `Page ${index} could not be loaded.`, { pdfiumError: fn.FPDF_GetLastError() });
	try {
		const count = fn.INK_Text_Count(text);
		const fontTable = readFontTable(heap, fn.INK_Text_FontTable(text));
		const cut = fn.INK_Text_Truncated(text);
		if (cut !== 0 && cut !== 1) throw fail("A page's characters could not be read.", /* @__PURE__ */ new Error(`INK_Text_Truncated: expected 0 or 1, got ${cut}`));
		const truncated = cut === 1;
		if (count === 0) return {
			count,
			codes: /* @__PURE__ */ new Uint32Array(0),
			geometry: /* @__PURE__ */ new Float32Array(0),
			flags: /* @__PURE__ */ new Uint8Array(0),
			fonts: /* @__PURE__ */ new Uint16Array(0),
			fontTable,
			truncated
		};
		const memory = native.HEAPU8.buffer;
		const at = (pointer, size, align) => {
			if (pointer === 0 || pointer % align !== 0 || pointer + size > memory.byteLength) throw fail("A page's characters could not be read.");
			return pointer;
		};
		const codes = at(fn.INK_Text_Codes(text), count * 4, 4);
		const geometry = at(fn.INK_Text_Geometry(text), count * 15 * 4, 4);
		const flags = at(fn.INK_Text_Flags(text), count, 1);
		const fonts = at(fn.INK_Text_Fonts(text), count * 2, 2);
		return {
			count,
			codes: new Uint32Array(memory, codes, count).slice(),
			geometry: new Float32Array(memory, geometry, count * 15).slice(),
			flags: new Uint8Array(memory, flags, count).slice(),
			fonts: new Uint16Array(memory, fonts, count).slice(),
			fontTable,
			truncated
		};
	} finally {
		if (!heap.stopped) fn.INK_Text_Free(text);
	}
}
//#endregion
//#region src/native/core.ts
const BITMAP_BGRA = 4;
const SAVE_FLAGS = {
	incremental: 1,
	rewrite: 2
};
const STOPPED$1 = "The engine stopped after an internal error; create a new engine.";
const CLOSED = "The document is closed.";
const BUSY = "A render is running; the engine runs one call at a time.";
const DESTROYED = "The engine is destroyed.";
/**
* Resolves in a later task, so messages and events that arrived meanwhile are handled first. A
* channel message is used rather than `setTimeout(0)`, which browsers hold back to 4 ms once
* timers nest, a third of every 8 ms slice. Each wait has its own channel, closed once used, so
* no open port keeps a Node process alive.
*/
function nextTask() {
	return new Promise((resolve) => {
		const { port1, port2 } = new MessageChannel();
		port1.onmessage = () => {
			port1.close();
			resolve();
		};
		port2.postMessage(null);
	});
}
const ALLOCATION_ABORT = /\bOOM\b|out of memory|Cannot enlarge memory|bad_alloc/i;
/**
* Maps an error thrown out of the module. A trap leaves the instance unusable, so anything other
* than the engine's own errors is an internal error.
*/
function internalError(error) {
	const text = error instanceof Error ? error.message : String(error);
	if (ALLOCATION_ABORT.test(text)) return new EngineError("out-of-memory", "The engine ran out of memory.", { cause: error });
	return new EngineError("engine-failure", `The engine failed: ${text}`, { cause: error });
}
const isOwnError = (error) => error instanceof EngineError || error instanceof ArgumentError;
const isRecord = (value) => typeof value === "object" && value !== null;
/** The fork takes 32-bit floats, so a number must stay finite as one. */
const finite = (n) => typeof n === "number" && Number.isFinite(Math.fround(n));
const isPoint = (p) => isRecord(p) && finite(p.x) && finite(p.y);
const isQuad = (q) => isRecord(q) && [
	q.p1,
	q.p2,
	q.p3,
	q.p4
].every(isPoint);
/**
* Throws an `ArgumentError` for a mark the apply cannot read: one that is not a `redact`
* annotation, has no appearance, or has neither quads, each with four finite corners, nor a
* finite rectangle.
*/
function checkMark(item, i) {
	const annotation = item.annotation;
	const name = typeof annotation.id === "string" ? annotation.id : `mark ${i}`;
	if (annotation.type !== "redact") throw new ArgumentError(`${name}: a mark must be a redact annotation`);
	if (!isRecord(item.appearance)) throw new ArgumentError(`${name}: a mark needs an appearance`);
	const { quads, rect } = annotation;
	if (quads !== void 0 && !Array.isArray(quads)) throw new ArgumentError(`${name}: quads must be a list`);
	if (Array.isArray(quads) && quads.length > 0) {
		if (!quads.every(isQuad)) throw new ArgumentError(`${name}: every quad needs p1 to p4, each with an x and y finite as 32-bit floats`);
		return;
	}
	if (!(isRecord(rect) && [
		rect.x,
		rect.y,
		rect.width,
		rect.height
	].every(finite))) throw new ArgumentError(`${name}: a mark without quads needs a rect with a finite x, y, width and height`);
}
/** Throws an `ArgumentError` for redact input whose shape `#checkWrite` cannot read. */
function checkRedactInput(input) {
	if (!isRecord(input)) throw new ArgumentError("the input must be an object");
	const list = (key, required) => {
		const value = input[key];
		if (value === void 0 && !required) return;
		if (!Array.isArray(value)) throw new ArgumentError(`${key} must be a list`);
		if (!value.every(isRecord)) throw new ArgumentError(`every item of ${key} must be an object`);
	};
	list("marks", true);
	list("remove", false);
	list("annotations", false);
	if (input.fields !== void 0 && !isRecord(input.fields)) throw new ArgumentError("fields must be an object");
	for (const key of ["marks", "annotations"]) for (const item of input[key] ?? []) if (!isRecord(item.annotation)) throw new ArgumentError(`every item of ${key} must hold an annotation`);
	input.marks.forEach(checkMark);
}
/**
* Throws an `ArgumentError` for regions `checkRedaction` cannot read. Whether each page is in
* the file is checked once the file is loaded.
*/
function checkRegions(regions) {
	if (regions === void 0) return;
	if (!Array.isArray(regions)) throw new ArgumentError("regions must be a list");
	regions.forEach((region, i) => {
		if (!isRecord(region)) throw new ArgumentError(`region ${i} must be an object`);
		if (!Number.isInteger(region.page)) throw new ArgumentError(`region ${i}: page must be a whole number`);
		const { quads } = region;
		if (!Array.isArray(quads) || quads.length === 0) throw new ArgumentError(`region ${i} must have at least one quad`);
		for (const quad of quads) if (!isQuad(quad)) throw new ArgumentError(`region ${i}: every quad needs p1 to p4, each with an x and y finite as 32-bit floats`);
	});
}
var EngineCore = class {
	#native;
	/** The module's functions. A throw out of one is a trap: it stops the engine at once. */
	#fn;
	#documents = /* @__PURE__ */ new Map();
	#heap;
	#nextId = 1;
	#destroyed = false;
	#stopped = false;
	/** True while a sliced render is between its first and last slice. */
	#rendering = false;
	/** Set by `destroy()` during a sliced render, which then stops and destroys the engine. */
	#destroyAfterRender = false;
	/** Aborted by `destroy()` during a sliced render, to stop a font fetch it is waiting on. */
	#ending = new AbortController();
	#fonts;
	constructor(native, options = {}) {
		this.#native = native;
		const fn = {};
		for (const name of Object.keys(FUNCTIONS)) fn[name] = (...args) => {
			try {
				return native.fn[name](...args);
			} catch (error) {
				this.#stopped = true;
				throw error;
			}
		};
		this.#fn = fn;
		const isStopped = () => this.#stopped;
		this.#heap = {
			fn: this.#fn,
			native,
			get stopped() {
				return isStopped();
			}
		};
		try {
			this.#fn.INK_Init();
		} catch (error) {
			throw internalError(error);
		}
		this.#fonts = createFontLoader(options.fallbackFonts, (key, bytes) => this.#guard(() => registerFont(this.#heap, key, bytes)));
	}
	/**
	* True when the engine was given at least one fallback font source. Without one, `write` and
	* `redact` do no font work at all.
	*/
	get fetchesFonts() {
		return this.#fonts.fetches;
	}
	/** True once a call into the module has failed; every later call is refused. */
	get stopped() {
		return this.#stopped;
	}
	get openCount() {
		return this.#documents.size;
	}
	/** Current size of the WASM heap in bytes. For tests and diagnostics. */
	get heapBytes() {
		return this.#native.HEAPU8.byteLength;
	}
	open(bytes, options = {}) {
		this.#checkLive();
		this.#checkIdle();
		return this.#guard(() => this.#open(bytes, options));
	}
	#open(bytes, options) {
		const fn = this.#fn;
		const data = fn.malloc(Math.max(bytes.length, 1));
		if (data === 0) throw new EngineError("out-of-memory", "The engine ran out of memory.");
		let doc = 0;
		try {
			this.#native.HEAPU8.set(bytes, data);
			const password = options.password === "" ? void 0 : options.password;
			let openedAs = "none";
			const loaded = this.#load(data, bytes.length, password, (opened) => {
				openedAs = readDocumentFacts(this.#heap, opened).openedAs;
			});
			doc = loaded.doc;
			const pageCount = fn.FPDF_GetPageCount(doc);
			if (pageCount <= 0) throw new EngineError("invalid-pdf", "The file is not a valid PDF.");
			const id = this.#nextId++;
			this.#documents.set(id, {
				doc,
				data,
				size: bytes.length,
				password,
				pageCount,
				written: false,
				redacted: false,
				encrypted: loaded.encrypted,
				openedAs,
				needs: /* @__PURE__ */ new Map()
			});
			return {
				id,
				pageCount
			};
		} catch (error) {
			if (!this.#stopped) {
				if (doc !== 0) fn.FPDF_CloseDocument(doc);
				fn.free(data);
			}
			throw error;
		}
	}
	/**
	* Loads a document from bytes already in engine memory, and says whether it is encrypted.
	* `beforeGrant` reads the document before its permission flags are lifted; when it throws, the
	* document is closed.
	*/
	#load(data, size, password, beforeGrant) {
		const fn = this.#fn;
		const pointer = password === void 0 ? 0 : this.#allocString(password);
		let doc;
		try {
			doc = fn.FPDF_LoadMemDocument64(data, size, pointer);
		} finally {
			if (pointer !== 0 && !this.#stopped) fn.free(pointer);
		}
		if (doc === 0) throw fromPdfiumError(fn.FPDF_GetLastError(), password !== void 0);
		if (beforeGrant) try {
			beforeGrant(doc);
		} catch (error) {
			if (!this.#stopped) fn.FPDF_CloseDocument(doc);
			throw error;
		}
		const encrypted = fn.EPDF_SetRuntimeOwnerPermissions(doc, 1) !== 0;
		return {
			doc,
			encrypted
		};
	}
	pageInfo(id, index) {
		const entry = this.#get(id);
		this.#checkIndex(entry, index);
		return this.#guard(() => this.#facts(entry, index));
	}
	/**
	* Reads the page's characters with the fallback fonts as they stand: it fetches none. Text read
	* before a page's fallback fonts are registered keeps PDFium's substitute in the document, which
	* a later render then draws, so the engine reads text through `pageTextAfterFonts`.
	*/
	pageText(id, index) {
		const entry = this.#get(id);
		this.#checkIndex(entry, index);
		return this.#guard(() => readPageText(this.#heap, entry.doc, index));
	}
	pageLinks(id, index) {
		const entry = this.#get(id);
		this.#checkIndex(entry, index);
		return this.#guard(() => readPageLinks(this.#heap, entry.doc, index));
	}
	documentFacts(id) {
		const entry = this.#get(id);
		return this.#guard(() => ({
			...readDocumentFacts(this.#heap, entry.doc),
			openedAs: entry.openedAs
		}));
	}
	pageAnnotations(id, index) {
		const entry = this.#get(id);
		this.#checkIndex(entry, index);
		return this.#guard(() => readPageAnnotations(this.#heap, entry.doc, index));
	}
	formFields(id) {
		const entry = this.#get(id);
		return this.#guard(() => readForm(this.#heap, entry.doc));
	}
	scripts(id) {
		const entry = this.#get(id);
		return this.#guard(() => readScripts(this.#heap, entry.doc, entry.pageCount));
	}
	structureOrder(id, index) {
		const entry = this.#get(id);
		this.#checkIndex(entry, index);
		return this.#guard(() => readStructureOrder(this.#heap, entry.doc, index));
	}
	outline(id) {
		const entry = this.#get(id);
		return this.#guard(() => readOutline(this.#heap, entry.doc));
	}
	namedDestination(id, name) {
		const entry = this.#get(id);
		return this.#guard(() => readNamedDestination(this.#heap, entry.doc, name));
	}
	/**
	* `pageText`, after fetching and registering the fallback fonts the page needs, as a render
	* does before its first slice: the characters' fonts are the ones the page will be drawn with.
	* With no font sources it is `pageText`, with nothing read or awaited first.
	*/
	async pageTextAfterFonts(id, index, signal) {
		if (!this.#fonts.fetches) return this.pageText(id, index);
		const entry = this.#get(id);
		this.#checkIndex(entry, index);
		return this.#afterFonts(entry, [index], signal, () => this.pageText(id, index));
	}
	/**
	* A page's size, rotation, box and user unit, read from its dictionary without loading the
	* page: loading it would load its fonts, and a document keeps the fonts it loaded first.
	*/
	#facts(entry, index) {
		const fn = this.#fn;
		const out = fn.malloc(24);
		if (out === 0) throw new EngineError("out-of-memory", "The engine ran out of memory.");
		try {
			if (!fn.INK_Page_Facts(entry.doc, index, out)) throw new EngineError("engine-failure", `Page ${index} could not be loaded.`, { pdfiumError: fn.FPDF_GetLastError() });
			const at = out / 4;
			const heap = this.#native.HEAPF32;
			const [left, bottom, right, top, rotation, userUnit] = Array.from(heap.subarray(at, at + 6));
			return {
				width: Math.fround(right - left),
				height: Math.fround(top - bottom),
				rotation,
				box: {
					x: left,
					y: bottom,
					width: right - left,
					height: top - bottom
				},
				userUnit
			};
		} finally {
			if (!this.#stopped) fn.free(out);
		}
	}
	#info(page) {
		const fn = this.#fn;
		const width = fn.FPDF_GetPageWidthF(page);
		const height = fn.FPDF_GetPageHeightF(page);
		const rotation = (fn.FPDFPage_GetRotation(page) % 4 + 4) % 4 * 90;
		const turned = rotation === 90 || rotation === 270;
		return {
			width: turned ? height : width,
			height: turned ? width : height,
			rotation,
			box: this.#pageBox(page),
			userUnit: fn.INK_Page_UserUnit(page)
		};
	}
	/** The page box in PDF user space, from PDFium's FS_RECTF (left, top, right, bottom). */
	#pageBox(page) {
		const fn = this.#fn;
		const rect = fn.malloc(16);
		if (rect === 0) throw new EngineError("out-of-memory", "The engine ran out of memory.");
		try {
			if (!fn.FPDF_GetPageBoundingBox(page, rect)) throw new EngineError("engine-failure", "The page box could not be read.");
			const at = rect / 4;
			const heap = this.#native.HEAPF32;
			const left = heap[at];
			const top = heap[at + 1];
			const right = heap[at + 2];
			const bottom = heap[at + 3];
			return {
				x: left,
				y: bottom,
				width: right - left,
				height: top - bottom
			};
		} finally {
			if (!this.#stopped) fn.free(rect);
		}
	}
	/**
	* Draws a page in one go, with the fallback fonts already registered: it fetches none. Its
	* `missingFonts` lists every font the page needs that is not registered.
	*/
	renderPage(id, index, options = {}) {
		const { entry, steps } = this.#renderSteps(id, index, options);
		return this.#guard(() => {
			const missingFonts = this.#fonts.missing(this.#needs(entry, index));
			let step = steps.next();
			while (!step.done) step = steps.next();
			return {
				...step.value,
				missingFonts
			};
		});
	}
	/**
	* Draws a page in slices of `SLICE_MS`, returning to the event loop between them. Before each
	* slice it asks `aborted`; once that says true, or `destroy()` has been called, the render
	* ends, frees what it took and rejects with `aborted`.
	*
	* Before the first slice it fetches and registers the fallback fonts the page needs and has
	* not had yet, so the page's first draw has every font it will ever get. `signal` stops that
	* fetch; it should abort whenever `aborted` turns true.
	*/
	async renderPageSliced(id, index, options, aborted, signal) {
		const { entry, steps } = this.#renderSteps(id, index, options);
		const { value, missingFonts } = await this.#sliced(entry, index, steps, aborted, signal);
		return {
			...value,
			missingFonts
		};
	}
	/**
	* Draws the annotations listed, each alone in the order given, onto a transparent bitmap placed
	* as `renderPageSliced` places the page for the same region, size and rotation. Like it, it
	* first fetches the page's fallback fonts, returns to the event loop about every `SLICE_MS`
	* between annotations, and stops with `aborted` once `aborted` says true.
	*/
	async renderAnnotationsSliced(id, index, options, aborted, signal) {
		const entry = this.#get(id);
		this.#checkIndex(entry, index);
		if (!isRecord(options)) throw new ArgumentError("the options must be an object");
		const draws = annotationDraws(options.annotations);
		if (options.region === void 0) throw new ArgumentError("region is required");
		if (options.size === void 0) throw new ArgumentError("size is required");
		const steps = this.#drawAnnotations(entry, index, options, draws);
		return (await this.#sliced(entry, index, steps, aborted, signal)).value;
	}
	/**
	* Runs `steps` a step at a time, returning to the event loop between them. Before each step it
	* asks `aborted`; once that says true, or `destroy()` has been called, it ends the steps, which
	* free what they took, and rejects with `aborted`.
	*
	* Before the first step it fetches and registers the fallback fonts the page needs and has
	* not had yet, so the page's first draw has every font it will ever get. `signal` stops that
	* fetch; it should abort whenever `aborted` turns true.
	*/
	async #sliced(entry, index, steps, aborted, signal) {
		this.#rendering = true;
		const stop = () => aborted() || this.#destroyAfterRender;
		try {
			const fonts = this.#ensureFonts(entry, [index], signal);
			const missingFonts = Array.isArray(fonts) ? fonts : await fonts;
			for (;;) {
				if (stop()) throw new EngineError("aborted", "The call was aborted.");
				const step = this.#guard(() => steps.next());
				if (step.done) return {
					value: step.value,
					missingFonts
				};
				await nextTask();
			}
		} finally {
			try {
				if (!this.#stopped) this.#guard(() => steps.return(void 0));
			} finally {
				this.#rendering = false;
				if (this.#destroyAfterRender) this.destroy();
			}
		}
	}
	/**
	* Checks the arguments at once, then draws when stepped: the first step loads the page and
	* starts the render, and each step after runs one slice. It pauses after every slice that
	* leaves more to do, and returns the pixels. Ending it early (`return`) ends the render and
	* frees what it took.
	*/
	#renderSteps(id, index, options) {
		const entry = this.#get(id);
		this.#checkIndex(entry, index);
		if (!isRecord(options)) throw new ArgumentError("the options must be an object");
		const hide = hiddenAnnotations(options.hide);
		return {
			entry,
			steps: this.#render(entry, index, options, hide)
		};
	}
	/**
	* Fetches and registers the fallback fonts `pages` need and have not had, and resolves with
	* those still missing. With no needs, or no font sources, it answers at once without waiting.
	* Called while the core is busy, so no other call runs meanwhile. Rejects with `aborted` when
	* `signal` aborts or `destroy()` is called.
	*/
	#ensureFonts(entry, pages, signal) {
		const needs = /* @__PURE__ */ new Set();
		this.#guard(() => {
			for (const index of pages) for (const key of this.#needs(entry, index)) needs.add(key);
		});
		if (needs.size === 0 || !this.#fonts.fetches) return this.#fonts.missing([...needs]);
		const stop = anySignal([signal, this.#ending.signal]);
		return this.#fonts.ensure([...needs], stop.signal).finally(stop.dispose);
	}
	/**
	* Runs `work` once the fonts of `pages` are fetched. Like a sliced render, the core refuses
	* other calls during the fetch, and a `destroy()` meanwhile stops it and rejects with
	* `aborted`.
	*/
	async #afterFonts(entry, pages, signal, work) {
		this.#rendering = true;
		try {
			await this.#ensureFonts(entry, pages, signal);
			if (this.#destroyAfterRender) throw new EngineError("aborted", "The call was aborted.");
		} finally {
			this.#rendering = false;
			if (this.#destroyAfterRender) this.destroy();
		}
		return work();
	}
	/** The fallback fonts a page needs, read once per document and page. */
	#needs(entry, index) {
		let keys = entry.needs.get(index);
		if (keys === void 0) {
			keys = keysOf(pageNeeds(this.#heap, entry.doc, index));
			entry.needs.set(index, keys);
		}
		return keys;
	}
	/**
	* Draws a page through the fork's sliced render, which leaves out the annotations in `hide`
	* and puts the document back as it was before it returns from starting.
	*/
	*#render(entry, index, options, hide) {
		const fn = this.#fn;
		const page = this.#loadPage(entry, index);
		try {
			const geometry = renderGeometry(this.#info(page), options);
			const { width, height } = geometry;
			const flags = options.annotations === false ? 0 : 32769;
			const bitmap = fn.FPDFBitmap_CreateEx(width, height, BITMAP_BGRA, 0, 0);
			if (bitmap === 0) throw new EngineError("out-of-memory", "The engine ran out of memory.");
			let skip = 0;
			let skipAt = 0;
			let render = 0;
			try {
				fn.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, 0);
				const heap = this.#native.HEAPU8;
				if (hide.objects.length > 0) {
					skip = fn.malloc(hide.objects.length * 4);
					if (skip === 0) throw new EngineError("out-of-memory", "The engine ran out of memory.");
					new Uint32Array(heap.buffer, heap.byteOffset + skip, hide.objects.length).set(hide.objects);
				}
				if (hide.places.length > 0) {
					skipAt = fn.malloc(hide.places.length * 4);
					if (skipAt === 0) throw new EngineError("out-of-memory", "The engine ran out of memory.");
					new Int32Array(heap.buffer, heap.byteOffset + skipAt, hide.places.length).set(hide.places);
				}
				render = fn.INK_Render_Start(bitmap, page, geometry.startX, geometry.startY, geometry.sizeX, geometry.sizeY, geometry.rotate, flags, skip, hide.objects.length, skipAt, hide.places.length);
				if (render === 0) throw new EngineError("engine-failure", `Page ${index} could not be drawn.`);
				let state = fn.INK_Render_Continue(render, 8);
				while (state === 0) {
					yield;
					state = fn.INK_Render_Continue(render, 8);
				}
				if (state !== 1) throw new EngineError("engine-failure", `Page ${index} could not be drawn.`);
				return this.#copyBitmap(bitmap, width, height);
			} finally {
				if (!this.#stopped) {
					fn.INK_Render_Close(render);
					if (skip !== 0) fn.free(skip);
					if (skipAt !== 0) fn.free(skipAt);
					fn.FPDFBitmap_Destroy(bitmap);
				}
			}
		} finally {
			if (!this.#stopped) fn.FPDF_ClosePage(page);
		}
	}
	/**
	* Draws each of `draws` alone through the module's annotation draw, onto a transparent bitmap
	* placed as `#render` places the page. It pauses whenever a slice's time has passed between
	* draws. The draw writes nothing to the document.
	*/
	*#drawAnnotations(entry, index, options, draws) {
		const fn = this.#fn;
		const page = this.#loadPage(entry, index);
		try {
			const { region, size, rotation } = options;
			const geometry = renderGeometry(this.#info(page), {
				region,
				size,
				...rotation !== void 0 && { rotation }
			});
			const { width, height } = geometry;
			const matrix = annotationMatrix(geometry, fn.FPDF_GetPageWidthF(page), fn.FPDF_GetPageHeightF(page));
			const bitmap = fn.FPDFBitmap_CreateEx(width, height, BITMAP_BGRA, 0, 0);
			if (bitmap === 0) throw new EngineError("out-of-memory", "The engine ran out of memory.");
			let at = 0;
			try {
				fn.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, 0);
				at = fn.malloc(matrix.length * 4);
				if (at === 0) throw new EngineError("out-of-memory", "The engine ran out of memory.");
				this.#native.HEAPF32.set(matrix, at / 4);
				const drawn = [];
				let sliceStart = performance.now();
				for (const draw of draws) {
					if (performance.now() - sliceStart >= 8) {
						yield;
						sliceStart = performance.now();
					}
					const { state } = draw;
					if (state === void 0 ? fn.INK_Annot_Draw(bitmap, page, draw.index, 0, at) : withBytes(this.#heap, state, (name) => fn.INK_Annot_Draw(bitmap, page, draw.index, name, at))) drawn.push(draw.index);
				}
				const left = Math.max(geometry.startX, 0);
				const top = Math.max(geometry.startY, 0);
				const right = Math.min(geometry.startX + geometry.sizeX, width);
				const bottom = Math.min(geometry.startY + geometry.sizeY, height);
				const convert = (data) => {
					straight(data);
					clearOutside(data, width, {
						left,
						top,
						right,
						bottom
					});
				};
				return {
					...this.#copyPixels(bitmap, width, height, convert),
					drawn
				};
			} finally {
				if (!this.#stopped) {
					if (at !== 0) fn.free(at);
					fn.FPDFBitmap_Destroy(bitmap);
				}
			}
		} finally {
			if (!this.#stopped) fn.FPDF_ClosePage(page);
		}
	}
	/** The bitmap's pixels as tightly packed RGBA rows over white, opaque, in memory the caller owns. */
	#copyBitmap(bitmap, width, height) {
		return this.#copyPixels(bitmap, width, height, overWhite);
	}
	/**
	* The bitmap's pixels as tightly packed rows, in memory the caller owns, with `convert` applied
	* to PDFium's blue, green, red and alpha in place.
	*/
	#copyPixels(bitmap, width, height, convert) {
		const fn = this.#fn;
		const stride = fn.FPDFBitmap_GetStride(bitmap);
		const buffer = fn.FPDFBitmap_GetBuffer(bitmap);
		const heap = this.#native.HEAPU8;
		const row = width * 4;
		let data;
		try {
			data = new Uint8ClampedArray(row * height);
		} catch (cause) {
			throw new EngineError("out-of-memory", "The engine ran out of memory.", { cause });
		}
		if (stride === row) data.set(heap.subarray(buffer, buffer + row * height));
		else for (let y = 0; y < height; y++) {
			const from = buffer + y * stride;
			data.set(heap.subarray(from, from + row), y * row);
		}
		convert(data);
		return {
			width,
			height,
			data
		};
	}
	/** Saves with `mode`, or with none: incrementally when the file holds a digital signature. */
	save(id, mode) {
		const entry = this.#get(id);
		if (entry.redacted && mode === "incremental") throw new ArgumentError("a redacted document is saved by rewriting it, not incrementally");
		return this.#guard(() => this.#save(entry, mode));
	}
	#save(entry, mode) {
		const fn = this.#fn;
		const chosen = entry.redacted ? "rewrite" : mode ?? (hasSignature(this.#heap, entry.doc) ? "incremental" : "rewrite");
		const writer = fn.INK_Save(entry.doc, SAVE_FLAGS[chosen]);
		if (writer === 0) throw new EngineError("engine-failure", "The document could not be saved.");
		try {
			const data = fn.INK_WriterData(writer);
			const size = fn.INK_WriterSize(writer);
			return this.#native.HEAPU8.slice(data, data + size);
		} finally {
			if (!this.#stopped) fn.INK_WriterFree(writer);
		}
	}
	/**
	* Writes `input` into the document as opened: the document is loaded again from its bytes, and
	* replaced only when every part of the input is written. A bad argument is an `ArgumentError`
	* before any native call; a part that cannot be written is `write-failed`, and the document is
	* then the file as opened.
	*/
	write(id, input) {
		const entry = this.#get(id);
		if (entry.redacted) throw new ArgumentError("the document holds a redaction; save it and open the redacted bytes as a new document to write to them");
		this.#checkWrite(entry, input);
		this.#guard(() => {
			this.#write(entry, input);
		});
	}
	/**
	* `write`, after fetching the fallback fonts of the pages it loads: those it removes from,
	* appends to, and that hold an annotation replied to. With form values, every page: redrawing
	* a field loads the font its /DA names, and the text the appearance holds depends on it. That
	* loads each page once, which takes time on a long document.
	*
	* Not covered: a field font named only in the form's /DR and used by no page. The page needs
	* call counts page resources, not /DR, so that font is not fetched first, and the appearance
	* bytes then depend on whether an earlier render registered its key. The module writes a wrong
	* appearance string for such a two-byte font either way.
	*
	* With no font sources it is `write`, with nothing read or awaited first.
	*/
	async writeAfterFonts(id, input, signal) {
		const entry = this.#get(id);
		if (entry.redacted || !this.#fonts.fetches) return this.write(id, input);
		this.#checkWrite(entry, input);
		const pages = /* @__PURE__ */ new Set();
		if (Object.keys(input.fields ?? {}).length > 0) for (let i = 0; i < entry.pageCount; i++) pages.add(i);
		for (const ref of input.remove ?? []) pages.add(ref.page);
		for (const item of input.annotations ?? []) {
			pages.add(item.page);
			if (item.replyTo) pages.add(item.replyTo.page);
		}
		await this.#afterFonts(entry, pages, signal, () => {
			this.write(id, input);
		});
	}
	/**
	* `redact`, after fetching the fallback fonts of every page: the apply visits each page, not
	* only those with marks. With no font sources it is `redact`, with nothing read or awaited
	* first.
	*/
	async redactAfterFonts(id, input, signal) {
		if (!this.#fonts.fetches) return this.redact(id, input);
		const entry = this.#get(id);
		checkRedactInput(input);
		const pages = Array.from({ length: entry.pageCount }, (_, i) => i);
		return this.#afterFonts(entry, pages, signal, () => this.redact(id, input));
	}
	#checkWrite(entry, input) {
		for (const ref of input.remove ?? []) {
			this.#checkIndex(entry, ref.page);
			if (!Number.isInteger(ref.objectNumber) || ref.objectNumber <= 0) throw new ArgumentError(`object number ${ref.objectNumber} is not a whole number above 0`);
		}
		for (const item of input.annotations ?? []) {
			this.#checkIndex(entry, item.page);
			if (item.replyTo !== void 0) {
				this.#checkIndex(entry, item.replyTo.page);
				if (!Number.isInteger(item.replyTo.objectNumber) || item.replyTo.objectNumber <= 0) throw new ArgumentError(`annotation ${String(item.annotation.id)}: replyTo object number ${item.replyTo.objectNumber} is not a whole number above 0`);
			}
			const id = item.annotation.id;
			if (typeof id !== "string") throw new ArgumentError("an annotation has no string id");
			if (typeof item.data !== "string") throw new ArgumentError(`annotation ${id}: data must be a string`);
			if (item.appearance) checkAppearance(item.appearance, `annotation ${id}`);
		}
		for (const [name, field] of Object.entries(input.fields ?? {})) {
			if (!isRecord(field)) throw new ArgumentError(`field "${name}" must be an object`);
			const { value, text } = field;
			if (!(typeof value === "string" || Array.isArray(value) && value.every((v) => typeof v === "string"))) throw new ArgumentError(`field "${name}": value must be a string or a list of strings`);
			if (text !== void 0 && typeof text !== "string") throw new ArgumentError(`field "${name}": text must be a string`);
		}
	}
	#write(entry, input) {
		this.#replace(entry, false, (doc) => {
			this.#apply(doc, input);
		});
	}
	/**
	* Runs `work` on the document loaded again from its bytes, and puts the result in place of the
	* document when it succeeds. When it fails the document is put back to the file as opened.
	*/
	#replace(entry, redacted, work) {
		const fn = this.#fn;
		const fresh = this.#load(entry.data, entry.size, entry.password).doc;
		let result;
		try {
			result = work(fresh);
		} catch (error) {
			if (!this.#stopped) {
				fn.FPDF_CloseDocument(fresh);
				if (entry.written) this.#reopen(entry);
			}
			throw error;
		}
		fn.FPDF_CloseDocument(entry.doc);
		entry.doc = fresh;
		entry.needs.clear();
		entry.written = true;
		entry.redacted = redacted;
		return result;
	}
	/**
	* Applies redaction marks and sanitises, on the document as opened, as `write` writes: the
	* document is replaced only when everything succeeds. Bad input is an `ArgumentError` before
	* any native call, checked as `write` checks it.
	*/
	redact(id, input) {
		const entry = this.#get(id);
		checkRedactInput(input);
		this.#checkWrite(entry, {
			...input.remove && { remove: input.remove },
			annotations: [...input.marks, ...input.annotations ?? []],
			...input.fields && { fields: input.fields }
		});
		return this.#guard(() => this.#replace(entry, true, (doc) => applyRedactions(this.#heap, doc, input, {
			data: entry.data,
			size: entry.size,
			pageCount: entry.pageCount,
			encrypted: entry.encrypted,
			pageBox: (page) => this.#pageBox(page),
			writeAnnotations: (annotations) => {
				this.#apply(doc, { annotations });
			}
		})));
	}
	/**
	* Checks what is left under `regions` of a file, or, without regions, under the candidates
	* the fork finds. The file is loaded on its own and closed before the call returns; open
	* documents are not touched.
	*/
	checkRedaction(bytes, options = {}) {
		this.#checkLive();
		if (this.#stopped) throw new EngineError("engine-failure", STOPPED$1);
		this.#checkIdle();
		checkRegions(options.regions);
		return this.#guard(() => {
			const fn = this.#fn;
			const data = fn.malloc(Math.max(bytes.length, 1));
			if (data === 0) throw new EngineError("out-of-memory", "The engine ran out of memory.");
			let doc = 0;
			try {
				this.#native.HEAPU8.set(bytes, data);
				const password = options.password === "" ? void 0 : options.password;
				doc = this.#load(data, bytes.length, password).doc;
				const pageCount = fn.FPDF_GetPageCount(doc);
				if (pageCount <= 0) throw new EngineError("invalid-pdf", "The file is not a valid PDF.");
				for (const { page } of options.regions ?? []) if (page < 0 || page >= pageCount) throw new ArgumentError(`page index ${page} is outside 0..${pageCount - 1}`);
				return inspectDocument(this.#heap, doc, {
					data,
					size: bytes.length,
					pageCount
				}, options.regions);
			} finally {
				if (!this.#stopped) {
					if (doc !== 0) fn.FPDF_CloseDocument(doc);
					fn.free(data);
				}
			}
		});
	}
	/** Puts the document back to the file as opened, after a failed write. */
	#reopen(entry) {
		let doc;
		try {
			doc = this.#load(entry.data, entry.size, entry.password).doc;
		} catch (error) {
			if (this.#stopped) throw error;
			return;
		}
		this.#fn.FPDF_CloseDocument(entry.doc);
		entry.doc = doc;
		entry.needs.clear();
		entry.written = false;
		entry.redacted = false;
	}
	/**
	* Sets form values first, then removes annotations, then appends, in input order. A page
	* stays loaded until its last use, or to the end when it holds the parent of a reply, whose
	* handle stays open for the reply to link to.
	*/
	#apply(doc, input) {
		const fn = this.#fn;
		writeFields(this.#heap, doc, input.fields ?? {});
		const remove = input.remove ?? [];
		const annotations = input.annotations ?? [];
		const steps = [...remove.map((ref) => ref.page), ...annotations.map((item) => item.page)];
		const lastUse = /* @__PURE__ */ new Map();
		steps.forEach((page, step) => lastUse.set(page, step));
		const parentIds = new Set(annotations.map((item) => item.annotation.inReplyTo));
		const pages = /* @__PURE__ */ new Map();
		const parents = /* @__PURE__ */ new Map();
		const pinned = new Set(annotations.flatMap((item) => item.replyTo?.page ?? []));
		const page = (index) => {
			let loaded = pages.get(index);
			if (loaded === void 0) {
				loaded = fn.FPDF_LoadPage(doc, index);
				if (loaded === 0) throw new EngineError("write-failed", `Page ${index} could not be loaded.`, { pdfiumError: fn.FPDF_GetLastError() });
				pages.set(index, loaded);
			}
			return loaded;
		};
		const done = (index, step) => {
			const loaded = pages.get(index);
			if (loaded === void 0 || pinned.has(index) || lastUse.get(index) !== step) return;
			pages.delete(index);
			fn.FPDF_ClosePage(loaded);
		};
		try {
			remove.forEach((ref, step) => {
				if (!fn.EPDFPage_RemoveAnnotByObjectNumber(page(ref.page), ref.objectNumber)) throw new EngineError("write-failed", `The annotation in object ${ref.objectNumber} on page ${ref.page} could not be removed.`);
				done(ref.page, step);
			});
			annotations.forEach((item, index) => {
				const id = item.annotation.id;
				const target = item.replyTo ? fn.EPDFPage_GetAnnotByObjectNumber(page(item.replyTo.page), item.replyTo.objectNumber) : void 0;
				let annot;
				try {
					annot = writeAnnotation(this.#heap, doc, page(item.page), item, parents, target);
				} finally {
					if (target && !this.#stopped) fn.FPDFPage_CloseAnnot(target);
				}
				if (parentIds.has(id) && !parents.has(id)) {
					parents.set(id, annot);
					pinned.add(item.page);
				} else fn.FPDFPage_CloseAnnot(annot);
				done(item.page, remove.length + index);
			});
		} finally {
			if (!this.#stopped) {
				for (const annot of parents.values()) fn.FPDFPage_CloseAnnot(annot);
				for (const loaded of pages.values()) fn.FPDF_ClosePage(loaded);
			}
		}
	}
	/**
	* Closes a document. After an internal error it only forgets it: the module is not called.
	* Once `destroy()` has been called it does nothing, since the destroy closes every document.
	*/
	close(id) {
		if (this.#destroyed || this.#destroyAfterRender) return;
		this.#checkIdle();
		this.#close(id);
	}
	#close(id) {
		const entry = this.#documents.get(id);
		if (!entry) return;
		this.#documents.delete(id);
		if (this.#stopped) return;
		this.#guard(() => {
			this.#fn.FPDF_CloseDocument(entry.doc);
			this.#fn.free(entry.data);
		});
	}
	/**
	* Closes every document and shuts PDFium down. After an internal error the module is not
	* called. A trap while shutting down stops the engine but does not make `destroy` throw.
	*/
	destroy() {
		if (this.#rendering) {
			this.#destroyAfterRender = true;
			this.#ending.abort();
			return;
		}
		if (!this.#stopped && !this.#destroyed) try {
			for (const id of [...this.#documents.keys()]) this.#close(id);
			this.#guard(() => {
				this.#fn.INK_Destroy();
			});
		} catch {}
		this.#documents.clear();
		this.#destroyed = true;
	}
	/** Runs a call into the module. A trap stops the engine for good. */
	#guard(work) {
		if (this.#stopped) throw new EngineError("engine-failure", STOPPED$1);
		try {
			return work();
		} catch (error) {
			if (isOwnError(error)) throw error;
			this.#stopped = true;
			throw internalError(error);
		}
	}
	#get(id) {
		this.#checkLive();
		if (this.#stopped) throw new EngineError("engine-failure", STOPPED$1);
		this.#checkIdle();
		const entry = this.#documents.get(id);
		if (!entry) throw new EngineError("engine-failure", CLOSED);
		return entry;
	}
	#checkIndex(entry, index) {
		if (!Number.isInteger(index) || index < 0 || index >= entry.pageCount) throw new ArgumentError(`page index ${index} is outside 0..${entry.pageCount - 1}`);
	}
	/** Refuses a call once `destroy()` has been called, or is due once the running render ends. */
	#checkLive() {
		if (this.#destroyed || this.#destroyAfterRender) throw new EngineError("engine-failure", DESTROYED);
	}
	/** Refuses a call that arrives while a sliced render is between slices. */
	#checkIdle() {
		if (this.#rendering) throw new EngineError("engine-failure", BUSY);
	}
	#loadPage(entry, index) {
		const fn = this.#fn;
		const page = fn.FPDF_LoadPage(entry.doc, index);
		if (page === 0) throw new EngineError("engine-failure", `Page ${index} could not be loaded.`, { pdfiumError: fn.FPDF_GetLastError() });
		return page;
	}
	#allocString(text) {
		const size = this.#native.lengthBytesUTF8(text) + 1;
		const ptr = this.#fn.malloc(size);
		if (ptr === 0) throw new EngineError("out-of-memory", "The engine ran out of memory.");
		this.#native.stringToUTF8(text, ptr, size);
		return ptr;
	}
};
/**
* Turns PDFium's pixels (blue, green, red, alpha, with straight alpha) into opaque RGBA laid over
* white, in place. A pixel is read as one 32-bit number with alpha in its top byte, which holds
* on the little-endian machines WebAssembly runs on.
*/
function overWhite(data) {
	const pixels = new Uint32Array(data.buffer, data.byteOffset, data.length >>> 2);
	for (let i = 0; i < pixels.length; i++) {
		const pixel = pixels[i];
		const alpha = pixel >>> 24;
		if (alpha === 255) {
			pixels[i] = (pixel & 4278255360 | (pixel & 255) << 16 | pixel >>> 16 & 255) >>> 0;
			continue;
		}
		if (alpha === 0) {
			pixels[i] = 4294967295;
			continue;
		}
		const white = 255 * (255 - alpha);
		const b = ((pixel & 255) * alpha + white) / 255 | 0;
		const g = ((pixel >>> 8 & 255) * alpha + white) / 255 | 0;
		const r = ((pixel >>> 16 & 255) * alpha + white) / 255 | 0;
		pixels[i] = (4278190080 | b << 16 | g << 8 | r) >>> 0;
	}
}
/**
* Turns PDFium's pixels (blue, green, red, alpha, with straight alpha) into straight RGBA, in
* place: blue and red change places, and a pixel with no alpha becomes all zero.
*/
function straight(data) {
	const pixels = new Uint32Array(data.buffer, data.byteOffset, data.length >>> 2);
	for (let i = 0; i < pixels.length; i++) {
		const pixel = pixels[i];
		pixels[i] = pixel >>> 24 === 0 ? 0 : (pixel & 4278255360 | (pixel & 255) << 16 | pixel >>> 16 & 255) >>> 0;
	}
}
/** Clears, in place, every pixel of RGBA `data` outside `[left, right) × [top, bottom)`. */
function clearOutside(data, width, clip) {
	const height = data.length / 4 / width;
	const row = width * 4;
	if (clip.left >= clip.right || clip.top >= clip.bottom) {
		data.fill(0);
		return;
	}
	data.fill(0, 0, clip.top * row);
	data.fill(0, clip.bottom * row, height * row);
	for (let y = clip.top; y < clip.bottom; y++) {
		data.fill(0, y * row, y * row + clip.left * 4);
		data.fill(0, y * row + clip.right * 4, (y + 1) * row);
	}
}
//#endregion
//#region vendor/inkbar-pdfium.mjs
var Module = (() => {
	var _scriptName = import.meta.url;
	return (async function(moduleArg = {}) {
		var moduleRtn;
		var Module = moduleArg;
		var readyPromiseResolve, readyPromiseReject;
		var readyPromise = new Promise((resolve, reject) => {
			readyPromiseResolve = resolve;
			readyPromiseReject = reject;
		});
		var ENVIRONMENT_IS_WEB = typeof window == "object";
		var ENVIRONMENT_IS_WORKER = typeof WorkerGlobalScope != "undefined";
		var ENVIRONMENT_IS_NODE = typeof process == "object" && typeof process.versions == "object" && typeof process.versions.node == "string" && process.type != "renderer";
		if (ENVIRONMENT_IS_NODE) {
			const { createRequire } = process.getBuiltinModule("module");
			let dirname = import.meta.url;
			if (dirname.startsWith("data:")) dirname = "/";
			var require = createRequire(dirname);
		}
		var moduleOverrides = Object.assign({}, Module);
		var thisProgram = "./this.program";
		var quit_ = (status, toThrow) => {
			throw toThrow;
		};
		var scriptDirectory = "";
		function locateFile(path) {
			if (Module["locateFile"]) return Module["locateFile"](path, scriptDirectory);
			return scriptDirectory + path;
		}
		var readAsync, readBinary;
		if (ENVIRONMENT_IS_NODE) {
			var fs = require("fs");
			var nodePath = require("path");
			if (!import.meta.url.startsWith("data:")) scriptDirectory = nodePath.dirname(require("url").fileURLToPath(import.meta.url)) + "/";
			readBinary = (filename) => {
				filename = isFileURI(filename) ? new URL(filename) : nodePath.normalize(filename);
				return fs.readFileSync(filename);
			};
			readAsync = (filename, binary = true) => {
				filename = isFileURI(filename) ? new URL(filename) : nodePath.normalize(filename);
				return new Promise((resolve, reject) => {
					fs.readFile(filename, binary ? void 0 : "utf8", (err, data) => {
						if (err) reject(err);
						else resolve(binary ? data.buffer : data);
					});
				});
			};
			if (!Module["thisProgram"] && process.argv.length > 1) thisProgram = process.argv[1].replace(/\\/g, "/");
			process.argv.slice(2);
			quit_ = (status, toThrow) => {
				process.exitCode = status;
				throw toThrow;
			};
		} else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
			if (ENVIRONMENT_IS_WORKER) scriptDirectory = self.location.href;
			else if (typeof document != "undefined" && document.currentScript) scriptDirectory = document.currentScript.src;
			if (_scriptName) scriptDirectory = _scriptName;
			if (scriptDirectory.startsWith("blob:")) scriptDirectory = "";
			else scriptDirectory = scriptDirectory.substr(0, scriptDirectory.replace(/[?#].*/, "").lastIndexOf("/") + 1);
			if (ENVIRONMENT_IS_WORKER) readBinary = (url) => {
				var xhr = new XMLHttpRequest();
				xhr.open("GET", url, false);
				xhr.responseType = "arraybuffer";
				xhr.send(null);
				return new Uint8Array(xhr.response);
			};
			readAsync = (url) => fetch(url, { credentials: "same-origin" }).then((response) => {
				if (response.ok) return response.arrayBuffer();
				return Promise.reject(/* @__PURE__ */ new Error(response.status + " : " + response.url));
			});
		}
		var out = Module["print"] || console.log.bind(console);
		var err = Module["printErr"] || console.error.bind(console);
		Object.assign(Module, moduleOverrides);
		moduleOverrides = null;
		if (Module["arguments"]) Module["arguments"];
		if (Module["thisProgram"]) thisProgram = Module["thisProgram"];
		var wasmBinary = Module["wasmBinary"];
		var wasmMemory;
		var ABORT = false, HEAP8, HEAPU8, HEAP16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
		function updateMemoryViews() {
			var b = wasmMemory.buffer;
			Module["HEAP8"] = HEAP8 = new Int8Array(b);
			Module["HEAP16"] = HEAP16 = new Int16Array(b);
			Module["HEAPU8"] = HEAPU8 = new Uint8Array(b);
			Module["HEAPU16"] = new Uint16Array(b);
			Module["HEAP32"] = HEAP32 = new Int32Array(b);
			Module["HEAPU32"] = HEAPU32 = new Uint32Array(b);
			Module["HEAPF32"] = HEAPF32 = new Float32Array(b);
			Module["HEAPF64"] = HEAPF64 = new Float64Array(b);
		}
		var __ATPRERUN__ = [];
		var __ATINIT__ = [];
		var __ATPOSTRUN__ = [];
		function preRun() {
			if (Module["preRun"]) {
				if (typeof Module["preRun"] == "function") Module["preRun"] = [Module["preRun"]];
				while (Module["preRun"].length) addOnPreRun(Module["preRun"].shift());
			}
			callRuntimeCallbacks(__ATPRERUN__);
		}
		function initRuntime() {
			callRuntimeCallbacks(__ATINIT__);
		}
		function postRun() {
			if (Module["postRun"]) {
				if (typeof Module["postRun"] == "function") Module["postRun"] = [Module["postRun"]];
				while (Module["postRun"].length) addOnPostRun(Module["postRun"].shift());
			}
			callRuntimeCallbacks(__ATPOSTRUN__);
		}
		function addOnPreRun(cb) {
			__ATPRERUN__.unshift(cb);
		}
		function addOnInit(cb) {
			__ATINIT__.unshift(cb);
		}
		function addOnPostRun(cb) {
			__ATPOSTRUN__.unshift(cb);
		}
		var runDependencies = 0;
		var runDependencyWatcher = null;
		var dependenciesFulfilled = null;
		function addRunDependency(id) {
			runDependencies++;
			Module["monitorRunDependencies"]?.(runDependencies);
		}
		function removeRunDependency(id) {
			runDependencies--;
			Module["monitorRunDependencies"]?.(runDependencies);
			if (runDependencies == 0) {
				if (runDependencyWatcher !== null) {
					clearInterval(runDependencyWatcher);
					runDependencyWatcher = null;
				}
				if (dependenciesFulfilled) {
					var callback = dependenciesFulfilled;
					dependenciesFulfilled = null;
					callback();
				}
			}
		}
		function abort(what) {
			Module["onAbort"]?.(what);
			what = "Aborted(" + what + ")";
			err(what);
			ABORT = true;
			what += ". Build with -sASSERTIONS for more info.";
			var e = new WebAssembly.RuntimeError(what);
			readyPromiseReject(e);
			throw e;
		}
		var dataURIPrefix = "data:application/octet-stream;base64,";
		var isDataURI = (filename) => filename.startsWith(dataURIPrefix);
		var isFileURI = (filename) => filename.startsWith("file://");
		function findWasmBinary() {
			if (Module["locateFile"]) {
				var f = "inkbar-pdfium.wasm";
				if (!isDataURI(f)) return locateFile(f);
				return f;
			}
			return new URL(["inkbar-pdfium", "wasm"].join("."), import.meta.url).href;
		}
		var wasmBinaryFile;
		function getBinarySync(file) {
			if (file == wasmBinaryFile && wasmBinary) return new Uint8Array(wasmBinary);
			if (readBinary) return readBinary(file);
			throw "both async and sync fetching of the wasm failed";
		}
		function getBinaryPromise(binaryFile) {
			if (!wasmBinary) return readAsync(binaryFile).then((response) => new Uint8Array(response), () => getBinarySync(binaryFile));
			return Promise.resolve().then(() => getBinarySync(binaryFile));
		}
		function instantiateArrayBuffer(binaryFile, imports, receiver) {
			return getBinaryPromise(binaryFile).then((binary) => WebAssembly.instantiate(binary, imports)).then(receiver, (reason) => {
				err(`failed to asynchronously prepare wasm: ${reason}`);
				abort(reason);
			});
		}
		function instantiateAsync(binary, binaryFile, imports, callback) {
			if (!binary && typeof WebAssembly.instantiateStreaming == "function" && !isDataURI(binaryFile) && !ENVIRONMENT_IS_NODE && typeof fetch == "function") return fetch(binaryFile, { credentials: "same-origin" }).then((response) => {
				return WebAssembly.instantiateStreaming(response, imports).then(callback, function(reason) {
					err(`wasm streaming compile failed: ${reason}`);
					err("falling back to ArrayBuffer instantiation");
					return instantiateArrayBuffer(binaryFile, imports, callback);
				});
			});
			return instantiateArrayBuffer(binaryFile, imports, callback);
		}
		function getWasmImports() {
			return {
				env: wasmImports,
				wasi_snapshot_preview1: wasmImports
			};
		}
		function createWasm() {
			function receiveInstance(instance, module) {
				wasmExports = instance.exports;
				wasmMemory = wasmExports["memory"];
				updateMemoryViews();
				wasmTable = wasmExports["__indirect_function_table"];
				addOnInit(wasmExports["__wasm_call_ctors"]);
				removeRunDependency("wasm-instantiate");
				return wasmExports;
			}
			addRunDependency("wasm-instantiate");
			function receiveInstantiationResult(result) {
				receiveInstance(result["instance"]);
			}
			var info = getWasmImports();
			if (Module["instantiateWasm"]) try {
				return Module["instantiateWasm"](info, receiveInstance);
			} catch (e) {
				err(`Module.instantiateWasm callback failed with error: ${e}`);
				readyPromiseReject(e);
			}
			wasmBinaryFile ??= findWasmBinary();
			instantiateAsync(wasmBinary, wasmBinaryFile, info, receiveInstantiationResult).catch(readyPromiseReject);
			return {};
		}
		class ExitStatus {
			name = "ExitStatus";
			constructor(status) {
				this.message = `Program terminated with exit(${status})`;
				this.status = status;
			}
		}
		var callRuntimeCallbacks = (callbacks) => {
			while (callbacks.length > 0) callbacks.shift()(Module);
		};
		function getValue(ptr, type = "i8") {
			if (type.endsWith("*")) type = "*";
			switch (type) {
				case "i1": return HEAP8[ptr];
				case "i8": return HEAP8[ptr];
				case "i16": return HEAP16[ptr >> 1];
				case "i32": return HEAP32[ptr >> 2];
				case "i64": abort("to do getValue(i64) use WASM_BIGINT");
				case "float": return HEAPF32[ptr >> 2];
				case "double": return HEAPF64[ptr >> 3];
				case "*": return HEAPU32[ptr >> 2];
				default: abort(`invalid type for getValue: ${type}`);
			}
		}
		var noExitRuntime = Module["noExitRuntime"] || true;
		function setValue(ptr, value, type = "i8") {
			if (type.endsWith("*")) type = "*";
			switch (type) {
				case "i1":
					HEAP8[ptr] = value;
					break;
				case "i8":
					HEAP8[ptr] = value;
					break;
				case "i16":
					HEAP16[ptr >> 1] = value;
					break;
				case "i32":
					HEAP32[ptr >> 2] = value;
					break;
				case "i64": abort("to do setValue(i64) use WASM_BIGINT");
				case "float":
					HEAPF32[ptr >> 2] = value;
					break;
				case "double":
					HEAPF64[ptr >> 3] = value;
					break;
				case "*":
					HEAPU32[ptr >> 2] = value;
					break;
				default: abort(`invalid type for setValue: ${type}`);
			}
		}
		var stackRestore = (val) => __emscripten_stack_restore(val);
		var stackSave = () => _emscripten_stack_get_current();
		var UTF8Decoder = typeof TextDecoder != "undefined" ? new TextDecoder() : void 0;
		var UTF8ArrayToString = (heapOrArray, idx = 0, maxBytesToRead = NaN) => {
			var endIdx = idx + maxBytesToRead;
			var endPtr = idx;
			while (heapOrArray[endPtr] && !(endPtr >= endIdx)) ++endPtr;
			if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
			var str = "";
			while (idx < endPtr) {
				var u0 = heapOrArray[idx++];
				if (!(u0 & 128)) {
					str += String.fromCharCode(u0);
					continue;
				}
				var u1 = heapOrArray[idx++] & 63;
				if ((u0 & 224) == 192) {
					str += String.fromCharCode((u0 & 31) << 6 | u1);
					continue;
				}
				var u2 = heapOrArray[idx++] & 63;
				if ((u0 & 240) == 224) u0 = (u0 & 15) << 12 | u1 << 6 | u2;
				else u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | heapOrArray[idx++] & 63;
				if (u0 < 65536) str += String.fromCharCode(u0);
				else {
					var ch = u0 - 65536;
					str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
				}
			}
			return str;
		};
		var UTF8ToString = (ptr, maxBytesToRead) => ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : "";
		var SYSCALLS = {
			varargs: void 0,
			getStr(ptr) {
				return UTF8ToString(ptr);
			}
		};
		function ___syscall_fcntl64(fd, cmd, varargs) {
			SYSCALLS.varargs = varargs;
			return 0;
		}
		var ___syscall_fstat64 = (fd, buf) => {};
		var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
			if (!(maxBytesToWrite > 0)) return 0;
			var startIdx = outIdx;
			var endIdx = outIdx + maxBytesToWrite - 1;
			for (var i = 0; i < str.length; ++i) {
				var u = str.charCodeAt(i);
				if (u >= 55296 && u <= 57343) {
					var u1 = str.charCodeAt(++i);
					u = 65536 + ((u & 1023) << 10) | u1 & 1023;
				}
				if (u <= 127) {
					if (outIdx >= endIdx) break;
					heap[outIdx++] = u;
				} else if (u <= 2047) {
					if (outIdx + 1 >= endIdx) break;
					heap[outIdx++] = 192 | u >> 6;
					heap[outIdx++] = 128 | u & 63;
				} else if (u <= 65535) {
					if (outIdx + 2 >= endIdx) break;
					heap[outIdx++] = 224 | u >> 12;
					heap[outIdx++] = 128 | u >> 6 & 63;
					heap[outIdx++] = 128 | u & 63;
				} else {
					if (outIdx + 3 >= endIdx) break;
					heap[outIdx++] = 240 | u >> 18;
					heap[outIdx++] = 128 | u >> 12 & 63;
					heap[outIdx++] = 128 | u >> 6 & 63;
					heap[outIdx++] = 128 | u & 63;
				}
			}
			heap[outIdx] = 0;
			return outIdx - startIdx;
		};
		var stringToUTF8 = (str, outPtr, maxBytesToWrite) => stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
		var ___syscall_getdents64 = (fd, dirp, count) => {};
		function ___syscall_ioctl(fd, op, varargs) {
			SYSCALLS.varargs = varargs;
			return 0;
		}
		var ___syscall_lstat64 = (path, buf) => {};
		var ___syscall_newfstatat = (dirfd, path, buf, flags) => {};
		function ___syscall_openat(dirfd, path, flags, varargs) {
			SYSCALLS.varargs = varargs;
		}
		var ___syscall_rmdir = (path) => {};
		var ___syscall_stat64 = (path, buf) => {};
		var ___syscall_unlinkat = (dirfd, path, flags) => {};
		var __abort_js = () => {
			abort("");
		};
		var nowIsMonotonic = 1;
		var __emscripten_get_now_is_monotonic = () => nowIsMonotonic;
		var __emscripten_memcpy_js = (dest, src, num) => HEAPU8.copyWithin(dest, src, src + num);
		var __emscripten_throw_longjmp = () => {
			throw Infinity;
		};
		var convertI32PairToI53Checked = (lo, hi) => hi + 2097152 >>> 0 < 4194305 - !!lo ? (lo >>> 0) + hi * 4294967296 : NaN;
		function __gmtime_js(time_low, time_high, tmPtr) {
			var time = convertI32PairToI53Checked(time_low, time_high);
			var date = /* @__PURE__ */ new Date(time * 1e3);
			HEAP32[tmPtr >> 2] = date.getUTCSeconds();
			HEAP32[tmPtr + 4 >> 2] = date.getUTCMinutes();
			HEAP32[tmPtr + 8 >> 2] = date.getUTCHours();
			HEAP32[tmPtr + 12 >> 2] = date.getUTCDate();
			HEAP32[tmPtr + 16 >> 2] = date.getUTCMonth();
			HEAP32[tmPtr + 20 >> 2] = date.getUTCFullYear() - 1900;
			HEAP32[tmPtr + 24 >> 2] = date.getUTCDay();
			var start = Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
			var yday = (date.getTime() - start) / 864e5 | 0;
			HEAP32[tmPtr + 28 >> 2] = yday;
		}
		function __mmap_js(len, prot, flags, fd, offset_low, offset_high, allocated, addr) {
			convertI32PairToI53Checked(offset_low, offset_high);
			return -52;
		}
		function __munmap_js(addr, len, prot, flags, fd, offset_low, offset_high) {
			convertI32PairToI53Checked(offset_low, offset_high);
		}
		var __tzset_js = (timezone, daylight, std_name, dst_name) => {
			var currentYear = (/* @__PURE__ */ new Date()).getFullYear();
			var winter = new Date(currentYear, 0, 1);
			var summer = new Date(currentYear, 6, 1);
			var winterOffset = winter.getTimezoneOffset();
			var summerOffset = summer.getTimezoneOffset();
			var stdTimezoneOffset = Math.max(winterOffset, summerOffset);
			HEAPU32[timezone >> 2] = stdTimezoneOffset * 60;
			HEAP32[daylight >> 2] = Number(winterOffset != summerOffset);
			var extractZone = (timezoneOffset) => {
				var sign = timezoneOffset >= 0 ? "-" : "+";
				var absOffset = Math.abs(timezoneOffset);
				return `UTC${sign}${String(Math.floor(absOffset / 60)).padStart(2, "0")}${String(absOffset % 60).padStart(2, "0")}`;
			};
			var winterName = extractZone(winterOffset);
			var summerName = extractZone(summerOffset);
			if (summerOffset < winterOffset) {
				stringToUTF8(winterName, std_name, 17);
				stringToUTF8(summerName, dst_name, 17);
			} else {
				stringToUTF8(winterName, dst_name, 17);
				stringToUTF8(summerName, std_name, 17);
			}
		};
		var _emscripten_date_now = () => Date.now();
		var _emscripten_err = (str) => err(UTF8ToString(str));
		var _emscripten_get_now = () => performance.now();
		var getHeapMax = () => 2147483648;
		var alignMemory = (size, alignment) => Math.ceil(size / alignment) * alignment;
		var growMemory = (size) => {
			var pages = (size - wasmMemory.buffer.byteLength + 65535) / 65536 | 0;
			try {
				wasmMemory.grow(pages);
				updateMemoryViews();
				return 1;
			} catch (e) {}
		};
		var _emscripten_resize_heap = (requestedSize) => {
			var oldSize = HEAPU8.length;
			requestedSize >>>= 0;
			var maxHeapSize = getHeapMax();
			if (requestedSize > maxHeapSize) return false;
			for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
				var overGrownHeapSize = oldSize * (1 + .2 / cutDown);
				overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
				if (growMemory(Math.min(maxHeapSize, alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536)))) return true;
			}
			return false;
		};
		var ENV = {};
		var getExecutableName = () => thisProgram || "./this.program";
		var getEnvStrings = () => {
			if (!getEnvStrings.strings) {
				var env = {
					USER: "web_user",
					LOGNAME: "web_user",
					PATH: "/",
					PWD: "/",
					HOME: "/home/web_user",
					LANG: (typeof navigator == "object" && navigator.languages && navigator.languages[0] || "C").replace("-", "_") + ".UTF-8",
					_: getExecutableName()
				};
				for (var x in ENV) if (ENV[x] === void 0) delete env[x];
				else env[x] = ENV[x];
				var strings = [];
				for (var x in env) strings.push(`${x}=${env[x]}`);
				getEnvStrings.strings = strings;
			}
			return getEnvStrings.strings;
		};
		var stringToAscii = (str, buffer) => {
			for (var i = 0; i < str.length; ++i) HEAP8[buffer++] = str.charCodeAt(i);
			HEAP8[buffer] = 0;
		};
		var _environ_get = (__environ, environ_buf) => {
			var bufSize = 0;
			getEnvStrings().forEach((string, i) => {
				var ptr = environ_buf + bufSize;
				HEAPU32[__environ + i * 4 >> 2] = ptr;
				stringToAscii(string, ptr);
				bufSize += string.length + 1;
			});
			return 0;
		};
		var _environ_sizes_get = (penviron_count, penviron_buf_size) => {
			var strings = getEnvStrings();
			HEAPU32[penviron_count >> 2] = strings.length;
			var bufSize = 0;
			strings.forEach((string) => bufSize += string.length + 1);
			HEAPU32[penviron_buf_size >> 2] = bufSize;
			return 0;
		};
		var runtimeKeepaliveCounter = 0;
		var keepRuntimeAlive = () => noExitRuntime || runtimeKeepaliveCounter > 0;
		var _proc_exit = (code) => {
			if (!keepRuntimeAlive()) {
				Module["onExit"]?.(code);
				ABORT = true;
			}
			quit_(code, new ExitStatus(code));
		};
		var exitJS = (status, implicit) => {
			_proc_exit(status);
		};
		var _exit = exitJS;
		var _fd_close = (fd) => 52;
		var _fd_read = (fd, iov, iovcnt, pnum) => 52;
		function _fd_seek(fd, offset_low, offset_high, whence, newOffset) {
			convertI32PairToI53Checked(offset_low, offset_high);
			return 70;
		}
		var printCharBuffers = [
			null,
			[],
			[]
		];
		var printChar = (stream, curr) => {
			var buffer = printCharBuffers[stream];
			if (curr === 0 || curr === 10) {
				(stream === 1 ? out : err)(UTF8ArrayToString(buffer));
				buffer.length = 0;
			} else buffer.push(curr);
		};
		var _fd_write = (fd, iov, iovcnt, pnum) => {
			var num = 0;
			for (var i = 0; i < iovcnt; i++) {
				var ptr = HEAPU32[iov >> 2];
				var len = HEAPU32[iov + 4 >> 2];
				iov += 8;
				for (var j = 0; j < len; j++) printChar(fd, HEAPU8[ptr + j]);
				num += len;
			}
			HEAPU32[pnum >> 2] = num;
			return 0;
		};
		var initRandomFill = () => {
			if (typeof crypto == "object" && typeof crypto["getRandomValues"] == "function") return (view) => crypto.getRandomValues(view);
			else if (ENVIRONMENT_IS_NODE) try {
				var crypto_module = require("crypto");
				if (crypto_module["randomFillSync"]) return (view) => crypto_module["randomFillSync"](view);
				var randomBytes = crypto_module["randomBytes"];
				return (view) => (view.set(randomBytes(view.byteLength)), view);
			} catch (e) {}
			abort("initRandomDevice");
		};
		var randomFill = (view) => (randomFill = initRandomFill())(view);
		var _random_get = (buffer, size) => {
			randomFill(HEAPU8.subarray(buffer, buffer + size));
			return 0;
		};
		var wasmTableMirror = [];
		var wasmTable;
		var getWasmTableEntry = (funcPtr) => {
			var func = wasmTableMirror[funcPtr];
			if (!func) {
				if (funcPtr >= wasmTableMirror.length) wasmTableMirror.length = funcPtr + 1;
				wasmTableMirror[funcPtr] = func = wasmTable.get(funcPtr);
			}
			return func;
		};
		var lengthBytesUTF8 = (str) => {
			var len = 0;
			for (var i = 0; i < str.length; ++i) {
				var c = str.charCodeAt(i);
				if (c <= 127) len++;
				else if (c <= 2047) len += 2;
				else if (c >= 55296 && c <= 57343) {
					len += 4;
					++i;
				} else len += 3;
			}
			return len;
		};
		var wasmImports = {
			__syscall_fcntl64: ___syscall_fcntl64,
			__syscall_fstat64: ___syscall_fstat64,
			__syscall_getdents64: ___syscall_getdents64,
			__syscall_ioctl: ___syscall_ioctl,
			__syscall_lstat64: ___syscall_lstat64,
			__syscall_newfstatat: ___syscall_newfstatat,
			__syscall_openat: ___syscall_openat,
			__syscall_rmdir: ___syscall_rmdir,
			__syscall_stat64: ___syscall_stat64,
			__syscall_unlinkat: ___syscall_unlinkat,
			_abort_js: __abort_js,
			_emscripten_get_now_is_monotonic: __emscripten_get_now_is_monotonic,
			_emscripten_memcpy_js: __emscripten_memcpy_js,
			_emscripten_throw_longjmp: __emscripten_throw_longjmp,
			_gmtime_js: __gmtime_js,
			_mmap_js: __mmap_js,
			_munmap_js: __munmap_js,
			_tzset_js: __tzset_js,
			emscripten_date_now: _emscripten_date_now,
			emscripten_err: _emscripten_err,
			emscripten_get_now: _emscripten_get_now,
			emscripten_resize_heap: _emscripten_resize_heap,
			environ_get: _environ_get,
			environ_sizes_get: _environ_sizes_get,
			exit: _exit,
			fd_close: _fd_close,
			fd_read: _fd_read,
			fd_seek: _fd_seek,
			fd_write: _fd_write,
			invoke_ii,
			invoke_iii,
			invoke_iiii,
			invoke_iiiii,
			invoke_iiiiii,
			invoke_iiiiiii,
			invoke_v,
			invoke_vi,
			invoke_vii,
			invoke_viii,
			invoke_viiii,
			random_get: _random_get
		};
		var wasmExports = createWasm();
		var _INK_Init = Module["_INK_Init"] = () => (_INK_Init = Module["_INK_Init"] = wasmExports["INK_Init"])();
		var _INK_Destroy = Module["_INK_Destroy"] = () => (_INK_Destroy = Module["_INK_Destroy"] = wasmExports["INK_Destroy"])();
		var _INK_Save = Module["_INK_Save"] = (a0, a1) => (_INK_Save = Module["_INK_Save"] = wasmExports["INK_Save"])(a0, a1);
		var _free = Module["_free"] = (a0) => (_free = Module["_free"] = wasmExports["free"])(a0);
		var _INK_WriterData = Module["_INK_WriterData"] = (a0) => (_INK_WriterData = Module["_INK_WriterData"] = wasmExports["INK_WriterData"])(a0);
		var _INK_WriterSize = Module["_INK_WriterSize"] = (a0) => (_INK_WriterSize = Module["_INK_WriterSize"] = wasmExports["INK_WriterSize"])(a0);
		var _INK_WriterFree = Module["_INK_WriterFree"] = (a0) => (_INK_WriterFree = Module["_INK_WriterFree"] = wasmExports["INK_WriterFree"])(a0);
		var _INK_Appearance_New = Module["_INK_Appearance_New"] = (a0, a1, a2, a3, a4, a5, a6, a7) => (_INK_Appearance_New = Module["_INK_Appearance_New"] = wasmExports["INK_Appearance_New"])(a0, a1, a2, a3, a4, a5, a6, a7);
		var _INK_Appearance_AddFont = Module["_INK_Appearance_AddFont"] = (a0, a1, a2) => (_INK_Appearance_AddFont = Module["_INK_Appearance_AddFont"] = wasmExports["INK_Appearance_AddFont"])(a0, a1, a2);
		var _INK_Appearance_AddOpacity = Module["_INK_Appearance_AddOpacity"] = (a0, a1, a2, a3) => (_INK_Appearance_AddOpacity = Module["_INK_Appearance_AddOpacity"] = wasmExports["INK_Appearance_AddOpacity"])(a0, a1, a2, a3);
		var _INK_Appearance_AddImage = Module["_INK_Appearance_AddImage"] = (a0, a1, a2, a3, a4) => (_INK_Appearance_AddImage = Module["_INK_Appearance_AddImage"] = wasmExports["INK_Appearance_AddImage"])(a0, a1, a2, a3, a4);
		var _INK_Appearance_AddPage = Module["_INK_Appearance_AddPage"] = (a0, a1, a2) => (_INK_Appearance_AddPage = Module["_INK_Appearance_AddPage"] = wasmExports["INK_Appearance_AddPage"])(a0, a1, a2);
		var _INK_Appearance_AddForm = Module["_INK_Appearance_AddForm"] = (a0, a1, a2) => (_INK_Appearance_AddForm = Module["_INK_Appearance_AddForm"] = wasmExports["INK_Appearance_AddForm"])(a0, a1, a2);
		var _INK_Appearance_Free = Module["_INK_Appearance_Free"] = (a0) => (_INK_Appearance_Free = Module["_INK_Appearance_Free"] = wasmExports["INK_Appearance_Free"])(a0);
		var _INK_Annot_SetAppearance = Module["_INK_Annot_SetAppearance"] = (a0, a1) => (_INK_Annot_SetAppearance = Module["_INK_Annot_SetAppearance"] = wasmExports["INK_Annot_SetAppearance"])(a0, a1);
		var _INK_Annot_SetData = Module["_INK_Annot_SetData"] = (a0, a1, a2) => (_INK_Annot_SetData = Module["_INK_Annot_SetData"] = wasmExports["INK_Annot_SetData"])(a0, a1, a2);
		var _INK_Redact_SetOverlay = Module["_INK_Redact_SetOverlay"] = (a0, a1, a2) => (_INK_Redact_SetOverlay = Module["_INK_Redact_SetOverlay"] = wasmExports["INK_Redact_SetOverlay"])(a0, a1, a2);
		var _INK_Redact_ApplyPage = Module["_INK_Redact_ApplyPage"] = (a0, a1, a2, a3, a4, a5, a6) => (_INK_Redact_ApplyPage = Module["_INK_Redact_ApplyPage"] = wasmExports["INK_Redact_ApplyPage"])(a0, a1, a2, a3, a4, a5, a6);
		var _EPDFPage_ApplyRedactions = Module["_EPDFPage_ApplyRedactions"] = (a0, a1, a2, a3) => (_EPDFPage_ApplyRedactions = Module["_EPDFPage_ApplyRedactions"] = wasmExports["EPDFPage_ApplyRedactions"])(a0, a1, a2, a3);
		var _FPDFPage_GenerateContent = Module["_FPDFPage_GenerateContent"] = (a0) => (_FPDFPage_GenerateContent = Module["_FPDFPage_GenerateContent"] = wasmExports["FPDFPage_GenerateContent"])(a0);
		var _FPDFPage_CloseAnnot = Module["_FPDFPage_CloseAnnot"] = (a0) => (_FPDFPage_CloseAnnot = Module["_FPDFPage_CloseAnnot"] = wasmExports["FPDFPage_CloseAnnot"])(a0);
		var _INK_Redact_OwnLockedQuads = Module["_INK_Redact_OwnLockedQuads"] = (a0, a1, a2, a3) => (_INK_Redact_OwnLockedQuads = Module["_INK_Redact_OwnLockedQuads"] = wasmExports["INK_Redact_OwnLockedQuads"])(a0, a1, a2, a3);
		var _INK_Sanitize = Module["_INK_Sanitize"] = (a0, a1, a2) => (_INK_Sanitize = Module["_INK_Sanitize"] = wasmExports["INK_Sanitize"])(a0, a1, a2);
		var _INK_Inspect_Page = Module["_INK_Inspect_Page"] = (a0, a1, a2, a3) => (_INK_Inspect_Page = Module["_INK_Inspect_Page"] = wasmExports["INK_Inspect_Page"])(a0, a1, a2, a3);
		var _FPDF_LoadPage = Module["_FPDF_LoadPage"] = (a0, a1) => (_FPDF_LoadPage = Module["_FPDF_LoadPage"] = wasmExports["FPDF_LoadPage"])(a0, a1);
		var _FPDF_ClosePage = Module["_FPDF_ClosePage"] = (a0) => (_FPDF_ClosePage = Module["_FPDF_ClosePage"] = wasmExports["FPDF_ClosePage"])(a0);
		var _malloc = Module["_malloc"] = (a0) => (_malloc = Module["_malloc"] = wasmExports["malloc"])(a0);
		var _INK_Redact_Unremovable = Module["_INK_Redact_Unremovable"] = (a0, a1, a2, a3) => (_INK_Redact_Unremovable = Module["_INK_Redact_Unremovable"] = wasmExports["INK_Redact_Unremovable"])(a0, a1, a2, a3);
		var _INK_Inspect_File = Module["_INK_Inspect_File"] = (a0, a1, a2) => (_INK_Inspect_File = Module["_INK_Inspect_File"] = wasmExports["INK_Inspect_File"])(a0, a1, a2);
		var _INK_Inspect_Free = Module["_INK_Inspect_Free"] = (a0) => (_INK_Inspect_Free = Module["_INK_Inspect_Free"] = wasmExports["INK_Inspect_Free"])(a0);
		var _INK_Render_Start = Module["_INK_Render_Start"] = (a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11) => (_INK_Render_Start = Module["_INK_Render_Start"] = wasmExports["INK_Render_Start"])(a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11);
		var _INK_Render_Continue = Module["_INK_Render_Continue"] = (a0, a1) => (_INK_Render_Continue = Module["_INK_Render_Continue"] = wasmExports["INK_Render_Continue"])(a0, a1);
		var _INK_Render_Close = Module["_INK_Render_Close"] = (a0) => (_INK_Render_Close = Module["_INK_Render_Close"] = wasmExports["INK_Render_Close"])(a0);
		var _INK_Page_UserUnit = Module["_INK_Page_UserUnit"] = (a0) => (_INK_Page_UserUnit = Module["_INK_Page_UserUnit"] = wasmExports["INK_Page_UserUnit"])(a0);
		var _INK_Page_Facts = Module["_INK_Page_Facts"] = (a0, a1, a2) => (_INK_Page_Facts = Module["_INK_Page_Facts"] = wasmExports["INK_Page_Facts"])(a0, a1, a2);
		var _INK_Fonts_Register = Module["_INK_Fonts_Register"] = (a0, a1, a2) => (_INK_Fonts_Register = Module["_INK_Fonts_Register"] = wasmExports["INK_Fonts_Register"])(a0, a1, a2);
		var _INK_Fonts_PageNeeds = Module["_INK_Fonts_PageNeeds"] = (a0, a1) => (_INK_Fonts_PageNeeds = Module["_INK_Fonts_PageNeeds"] = wasmExports["INK_Fonts_PageNeeds"])(a0, a1);
		var _INK_Fonts_TakeMisses = Module["_INK_Fonts_TakeMisses"] = () => (_INK_Fonts_TakeMisses = Module["_INK_Fonts_TakeMisses"] = wasmExports["INK_Fonts_TakeMisses"])();
		var _INK_Text_Page = Module["_INK_Text_Page"] = (a0, a1) => (_INK_Text_Page = Module["_INK_Text_Page"] = wasmExports["INK_Text_Page"])(a0, a1);
		var _FPDF_GetPageCount = Module["_FPDF_GetPageCount"] = (a0) => (_FPDF_GetPageCount = Module["_FPDF_GetPageCount"] = wasmExports["FPDF_GetPageCount"])(a0);
		var _INK_Text_Count = Module["_INK_Text_Count"] = (a0) => (_INK_Text_Count = Module["_INK_Text_Count"] = wasmExports["INK_Text_Count"])(a0);
		var _INK_Text_Codes = Module["_INK_Text_Codes"] = (a0) => (_INK_Text_Codes = Module["_INK_Text_Codes"] = wasmExports["INK_Text_Codes"])(a0);
		var _INK_Text_Geometry = Module["_INK_Text_Geometry"] = (a0) => (_INK_Text_Geometry = Module["_INK_Text_Geometry"] = wasmExports["INK_Text_Geometry"])(a0);
		var _INK_Text_Flags = Module["_INK_Text_Flags"] = (a0) => (_INK_Text_Flags = Module["_INK_Text_Flags"] = wasmExports["INK_Text_Flags"])(a0);
		var _INK_Text_Fonts = Module["_INK_Text_Fonts"] = (a0) => (_INK_Text_Fonts = Module["_INK_Text_Fonts"] = wasmExports["INK_Text_Fonts"])(a0);
		var _INK_Text_FontTable = Module["_INK_Text_FontTable"] = (a0) => (_INK_Text_FontTable = Module["_INK_Text_FontTable"] = wasmExports["INK_Text_FontTable"])(a0);
		var _INK_Text_Truncated = Module["_INK_Text_Truncated"] = (a0) => (_INK_Text_Truncated = Module["_INK_Text_Truncated"] = wasmExports["INK_Text_Truncated"])(a0);
		var _INK_Text_Free = Module["_INK_Text_Free"] = (a0) => (_INK_Text_Free = Module["_INK_Text_Free"] = wasmExports["INK_Text_Free"])(a0);
		var _INK_Links_Page = Module["_INK_Links_Page"] = (a0, a1) => (_INK_Links_Page = Module["_INK_Links_Page"] = wasmExports["INK_Links_Page"])(a0, a1);
		var _INK_Outline = Module["_INK_Outline"] = (a0) => (_INK_Outline = Module["_INK_Outline"] = wasmExports["INK_Outline"])(a0);
		var _INK_Dest_Named = Module["_INK_Dest_Named"] = (a0, a1, a2) => (_INK_Dest_Named = Module["_INK_Dest_Named"] = wasmExports["INK_Dest_Named"])(a0, a1, a2);
		var _INK_Json_Free = Module["_INK_Json_Free"] = (a0) => (_INK_Json_Free = Module["_INK_Json_Free"] = wasmExports["INK_Json_Free"])(a0);
		var _INK_Annots_Page = Module["_INK_Annots_Page"] = (a0, a1) => (_INK_Annots_Page = Module["_INK_Annots_Page"] = wasmExports["INK_Annots_Page"])(a0, a1);
		var _INK_Struct_Order = Module["_INK_Struct_Order"] = (a0, a1) => (_INK_Struct_Order = Module["_INK_Struct_Order"] = wasmExports["INK_Struct_Order"])(a0, a1);
		var _INK_Annot_Draw = Module["_INK_Annot_Draw"] = (a0, a1, a2, a3, a4) => (_INK_Annot_Draw = Module["_INK_Annot_Draw"] = wasmExports["INK_Annot_Draw"])(a0, a1, a2, a3, a4);
		var _INK_Form = Module["_INK_Form"] = (a0) => (_INK_Form = Module["_INK_Form"] = wasmExports["INK_Form"])(a0);
		var _INK_Scripts = Module["_INK_Scripts"] = (a0) => (_INK_Scripts = Module["_INK_Scripts"] = wasmExports["INK_Scripts"])(a0);
		var _INK_Doc_Facts = Module["_INK_Doc_Facts"] = (a0) => (_INK_Doc_Facts = Module["_INK_Doc_Facts"] = wasmExports["INK_Doc_Facts"])(a0);
		var _EPDFAnnot_SetColor = Module["_EPDFAnnot_SetColor"] = (a0, a1, a2, a3, a4) => (_EPDFAnnot_SetColor = Module["_EPDFAnnot_SetColor"] = wasmExports["EPDFAnnot_SetColor"])(a0, a1, a2, a3, a4);
		var _EPDFAnnot_SetOpacity = Module["_EPDFAnnot_SetOpacity"] = (a0, a1) => (_EPDFAnnot_SetOpacity = Module["_EPDFAnnot_SetOpacity"] = wasmExports["EPDFAnnot_SetOpacity"])(a0, a1);
		var _EPDFAnnot_SetBorderDashPattern = Module["_EPDFAnnot_SetBorderDashPattern"] = (a0, a1, a2) => (_EPDFAnnot_SetBorderDashPattern = Module["_EPDFAnnot_SetBorderDashPattern"] = wasmExports["EPDFAnnot_SetBorderDashPattern"])(a0, a1, a2);
		var _EPDFAnnot_SetBorderStyle = Module["_EPDFAnnot_SetBorderStyle"] = (a0, a1, a2) => (_EPDFAnnot_SetBorderStyle = Module["_EPDFAnnot_SetBorderStyle"] = wasmExports["EPDFAnnot_SetBorderStyle"])(a0, a1, a2);
		var _EPDFAnnot_SetIntent = Module["_EPDFAnnot_SetIntent"] = (a0, a1) => (_EPDFAnnot_SetIntent = Module["_EPDFAnnot_SetIntent"] = wasmExports["EPDFAnnot_SetIntent"])(a0, a1);
		var _EPDFAnnot_SetLineEndings = Module["_EPDFAnnot_SetLineEndings"] = (a0, a1, a2) => (_EPDFAnnot_SetLineEndings = Module["_EPDFAnnot_SetLineEndings"] = wasmExports["EPDFAnnot_SetLineEndings"])(a0, a1, a2);
		var _EPDFAnnot_SetVertices = Module["_EPDFAnnot_SetVertices"] = (a0, a1, a2) => (_EPDFAnnot_SetVertices = Module["_EPDFAnnot_SetVertices"] = wasmExports["EPDFAnnot_SetVertices"])(a0, a1, a2);
		var _EPDFAnnot_SetLine = Module["_EPDFAnnot_SetLine"] = (a0, a1, a2) => (_EPDFAnnot_SetLine = Module["_EPDFAnnot_SetLine"] = wasmExports["EPDFAnnot_SetLine"])(a0, a1, a2);
		var _EPDFAnnot_SetDefaultAppearance = Module["_EPDFAnnot_SetDefaultAppearance"] = (a0, a1, a2, a3, a4, a5) => (_EPDFAnnot_SetDefaultAppearance = Module["_EPDFAnnot_SetDefaultAppearance"] = wasmExports["EPDFAnnot_SetDefaultAppearance"])(a0, a1, a2, a3, a4, a5);
		var _EPDFAnnot_SetTextAlignment = Module["_EPDFAnnot_SetTextAlignment"] = (a0, a1) => (_EPDFAnnot_SetTextAlignment = Module["_EPDFAnnot_SetTextAlignment"] = wasmExports["EPDFAnnot_SetTextAlignment"])(a0, a1);
		var _EPDFAnnot_SetLinkedAnnot = Module["_EPDFAnnot_SetLinkedAnnot"] = (a0, a1, a2) => (_EPDFAnnot_SetLinkedAnnot = Module["_EPDFAnnot_SetLinkedAnnot"] = wasmExports["EPDFAnnot_SetLinkedAnnot"])(a0, a1, a2);
		var _EPDFAnnot_SetName = Module["_EPDFAnnot_SetName"] = (a0, a1) => (_EPDFAnnot_SetName = Module["_EPDFAnnot_SetName"] = wasmExports["EPDFAnnot_SetName"])(a0, a1);
		var _EPDFAnnot_SetCalloutLine = Module["_EPDFAnnot_SetCalloutLine"] = (a0, a1, a2) => (_EPDFAnnot_SetCalloutLine = Module["_EPDFAnnot_SetCalloutLine"] = wasmExports["EPDFAnnot_SetCalloutLine"])(a0, a1, a2);
		var _EPDFAnnot_GetObjectNumber = Module["_EPDFAnnot_GetObjectNumber"] = (a0) => (_EPDFAnnot_GetObjectNumber = Module["_EPDFAnnot_GetObjectNumber"] = wasmExports["EPDFAnnot_GetObjectNumber"])(a0);
		var _EPDFPage_GetAnnotByObjectNumber = Module["_EPDFPage_GetAnnotByObjectNumber"] = (a0, a1) => (_EPDFPage_GetAnnotByObjectNumber = Module["_EPDFPage_GetAnnotByObjectNumber"] = wasmExports["EPDFPage_GetAnnotByObjectNumber"])(a0, a1);
		var _EPDFPage_RemoveAnnotByObjectNumber = Module["_EPDFPage_RemoveAnnotByObjectNumber"] = (a0, a1) => (_EPDFPage_RemoveAnnotByObjectNumber = Module["_EPDFPage_RemoveAnnotByObjectNumber"] = wasmExports["EPDFPage_RemoveAnnotByObjectNumber"])(a0, a1);
		var _EPDFForm_LoadModel = Module["_EPDFForm_LoadModel"] = (a0) => (_EPDFForm_LoadModel = Module["_EPDFForm_LoadModel"] = wasmExports["EPDFForm_LoadModel"])(a0);
		var _EPDFForm_CloseModel = Module["_EPDFForm_CloseModel"] = (a0) => (_EPDFForm_CloseModel = Module["_EPDFForm_CloseModel"] = wasmExports["EPDFForm_CloseModel"])(a0);
		var _EPDFForm_CountFields = Module["_EPDFForm_CountFields"] = (a0) => (_EPDFForm_CountFields = Module["_EPDFForm_CountFields"] = wasmExports["EPDFForm_CountFields"])(a0);
		var _EPDFForm_GetFieldObjNum = Module["_EPDFForm_GetFieldObjNum"] = (a0, a1) => (_EPDFForm_GetFieldObjNum = Module["_EPDFForm_GetFieldObjNum"] = wasmExports["EPDFForm_GetFieldObjNum"])(a0, a1);
		var _EPDFForm_GetFieldFamily = Module["_EPDFForm_GetFieldFamily"] = (a0, a1) => (_EPDFForm_GetFieldFamily = Module["_EPDFForm_GetFieldFamily"] = wasmExports["EPDFForm_GetFieldFamily"])(a0, a1);
		var _EPDFForm_GetFieldFlags = Module["_EPDFForm_GetFieldFlags"] = (a0, a1) => (_EPDFForm_GetFieldFlags = Module["_EPDFForm_GetFieldFlags"] = wasmExports["EPDFForm_GetFieldFlags"])(a0, a1);
		var _EPDFForm_GetFieldName = Module["_EPDFForm_GetFieldName"] = (a0, a1, a2, a3) => (_EPDFForm_GetFieldName = Module["_EPDFForm_GetFieldName"] = wasmExports["EPDFForm_GetFieldName"])(a0, a1, a2, a3);
		var _EPDFForm_GetFieldValueKind = Module["_EPDFForm_GetFieldValueKind"] = (a0, a1) => (_EPDFForm_GetFieldValueKind = Module["_EPDFForm_GetFieldValueKind"] = wasmExports["EPDFForm_GetFieldValueKind"])(a0, a1);
		var _EPDFForm_CountFieldOptions = Module["_EPDFForm_CountFieldOptions"] = (a0, a1) => (_EPDFForm_CountFieldOptions = Module["_EPDFForm_CountFieldOptions"] = wasmExports["EPDFForm_CountFieldOptions"])(a0, a1);
		var _EPDFForm_GetFieldOptionValue = Module["_EPDFForm_GetFieldOptionValue"] = (a0, a1, a2, a3, a4) => (_EPDFForm_GetFieldOptionValue = Module["_EPDFForm_GetFieldOptionValue"] = wasmExports["EPDFForm_GetFieldOptionValue"])(a0, a1, a2, a3, a4);
		var _EPDFForm_CountFieldWidgets = Module["_EPDFForm_CountFieldWidgets"] = (a0, a1) => (_EPDFForm_CountFieldWidgets = Module["_EPDFForm_CountFieldWidgets"] = wasmExports["EPDFForm_CountFieldWidgets"])(a0, a1);
		var _EPDFForm_GetFieldWidgetOnState = Module["_EPDFForm_GetFieldWidgetOnState"] = (a0, a1, a2, a3, a4) => (_EPDFForm_GetFieldWidgetOnState = Module["_EPDFForm_GetFieldWidgetOnState"] = wasmExports["EPDFForm_GetFieldWidgetOnState"])(a0, a1, a2, a3, a4);
		var _EPDFForm_SetFieldValue = Module["_EPDFForm_SetFieldValue"] = (a0, a1, a2, a3, a4) => (_EPDFForm_SetFieldValue = Module["_EPDFForm_SetFieldValue"] = wasmExports["EPDFForm_SetFieldValue"])(a0, a1, a2, a3, a4);
		var _EPDFForm_SetFieldSelectedIndices = Module["_EPDFForm_SetFieldSelectedIndices"] = (a0, a1, a2, a3) => (_EPDFForm_SetFieldSelectedIndices = Module["_EPDFForm_SetFieldSelectedIndices"] = wasmExports["EPDFForm_SetFieldSelectedIndices"])(a0, a1, a2, a3);
		var _EPDFForm_SetFieldWidgetsChecked = Module["_EPDFForm_SetFieldWidgetsChecked"] = (a0, a1, a2, a3, a4, a5, a6) => (_EPDFForm_SetFieldWidgetsChecked = Module["_EPDFForm_SetFieldWidgetsChecked"] = wasmExports["EPDFForm_SetFieldWidgetsChecked"])(a0, a1, a2, a3, a4, a5, a6);
		var _EPDFForm_RedrawFieldWidgets = Module["_EPDFForm_RedrawFieldWidgets"] = (a0, a1, a2, a3, a4) => (_EPDFForm_RedrawFieldWidgets = Module["_EPDFForm_RedrawFieldWidgets"] = wasmExports["EPDFForm_RedrawFieldWidgets"])(a0, a1, a2, a3, a4);
		var _EPDFForm_SetFieldAppearanceText = Module["_EPDFForm_SetFieldAppearanceText"] = (a0, a1, a2, a3, a4, a5) => (_EPDFForm_SetFieldAppearanceText = Module["_EPDFForm_SetFieldAppearanceText"] = wasmExports["EPDFForm_SetFieldAppearanceText"])(a0, a1, a2, a3, a4, a5);
		var _FPDFPage_CreateAnnot = Module["_FPDFPage_CreateAnnot"] = (a0, a1) => (_FPDFPage_CreateAnnot = Module["_FPDFPage_CreateAnnot"] = wasmExports["FPDFPage_CreateAnnot"])(a0, a1);
		var _FPDFAnnot_AddInkStroke = Module["_FPDFAnnot_AddInkStroke"] = (a0, a1, a2) => (_FPDFAnnot_AddInkStroke = Module["_FPDFAnnot_AddInkStroke"] = wasmExports["FPDFAnnot_AddInkStroke"])(a0, a1, a2);
		var _FPDFAnnot_AppendAttachmentPoints = Module["_FPDFAnnot_AppendAttachmentPoints"] = (a0, a1) => (_FPDFAnnot_AppendAttachmentPoints = Module["_FPDFAnnot_AppendAttachmentPoints"] = wasmExports["FPDFAnnot_AppendAttachmentPoints"])(a0, a1);
		var _FPDFAnnot_SetRect = Module["_FPDFAnnot_SetRect"] = (a0, a1) => (_FPDFAnnot_SetRect = Module["_FPDFAnnot_SetRect"] = wasmExports["FPDFAnnot_SetRect"])(a0, a1);
		var _FPDFAnnot_SetBorder = Module["_FPDFAnnot_SetBorder"] = (a0, a1, a2, a3) => (_FPDFAnnot_SetBorder = Module["_FPDFAnnot_SetBorder"] = wasmExports["FPDFAnnot_SetBorder"])(a0, a1, a2, a3);
		var _FPDFAnnot_SetStringValue = Module["_FPDFAnnot_SetStringValue"] = (a0, a1, a2) => (_FPDFAnnot_SetStringValue = Module["_FPDFAnnot_SetStringValue"] = wasmExports["FPDFAnnot_SetStringValue"])(a0, a1, a2);
		var _FPDFAnnot_SetFlags = Module["_FPDFAnnot_SetFlags"] = (a0, a1) => (_FPDFAnnot_SetFlags = Module["_FPDFAnnot_SetFlags"] = wasmExports["FPDFAnnot_SetFlags"])(a0, a1);
		var _FPDFPage_GetRotation = Module["_FPDFPage_GetRotation"] = (a0) => (_FPDFPage_GetRotation = Module["_FPDFPage_GetRotation"] = wasmExports["FPDFPage_GetRotation"])(a0);
		var _FPDF_LoadMemDocument64 = Module["_FPDF_LoadMemDocument64"] = (a0, a1, a2) => (_FPDF_LoadMemDocument64 = Module["_FPDF_LoadMemDocument64"] = wasmExports["FPDF_LoadMemDocument64"])(a0, a1, a2);
		var _EPDF_SetRuntimeOwnerPermissions = Module["_EPDF_SetRuntimeOwnerPermissions"] = (a0, a1) => (_EPDF_SetRuntimeOwnerPermissions = Module["_EPDF_SetRuntimeOwnerPermissions"] = wasmExports["EPDF_SetRuntimeOwnerPermissions"])(a0, a1);
		var _FPDF_GetPageWidthF = Module["_FPDF_GetPageWidthF"] = (a0) => (_FPDF_GetPageWidthF = Module["_FPDF_GetPageWidthF"] = wasmExports["FPDF_GetPageWidthF"])(a0);
		var _FPDF_GetPageHeightF = Module["_FPDF_GetPageHeightF"] = (a0) => (_FPDF_GetPageHeightF = Module["_FPDF_GetPageHeightF"] = wasmExports["FPDF_GetPageHeightF"])(a0);
		var _FPDF_GetPageBoundingBox = Module["_FPDF_GetPageBoundingBox"] = (a0, a1) => (_FPDF_GetPageBoundingBox = Module["_FPDF_GetPageBoundingBox"] = wasmExports["FPDF_GetPageBoundingBox"])(a0, a1);
		var _FPDF_RenderPageBitmap = Module["_FPDF_RenderPageBitmap"] = (a0, a1, a2, a3, a4, a5, a6, a7) => (_FPDF_RenderPageBitmap = Module["_FPDF_RenderPageBitmap"] = wasmExports["FPDF_RenderPageBitmap"])(a0, a1, a2, a3, a4, a5, a6, a7);
		var _FPDF_CloseDocument = Module["_FPDF_CloseDocument"] = (a0) => (_FPDF_CloseDocument = Module["_FPDF_CloseDocument"] = wasmExports["FPDF_CloseDocument"])(a0);
		var _FPDF_GetLastError = Module["_FPDF_GetLastError"] = () => (_FPDF_GetLastError = Module["_FPDF_GetLastError"] = wasmExports["FPDF_GetLastError"])();
		var _FPDFBitmap_CreateEx = Module["_FPDFBitmap_CreateEx"] = (a0, a1, a2, a3, a4) => (_FPDFBitmap_CreateEx = Module["_FPDFBitmap_CreateEx"] = wasmExports["FPDFBitmap_CreateEx"])(a0, a1, a2, a3, a4);
		var _FPDFBitmap_FillRect = Module["_FPDFBitmap_FillRect"] = (a0, a1, a2, a3, a4, a5) => (_FPDFBitmap_FillRect = Module["_FPDFBitmap_FillRect"] = wasmExports["FPDFBitmap_FillRect"])(a0, a1, a2, a3, a4, a5);
		var _FPDFBitmap_GetBuffer = Module["_FPDFBitmap_GetBuffer"] = (a0) => (_FPDFBitmap_GetBuffer = Module["_FPDFBitmap_GetBuffer"] = wasmExports["FPDFBitmap_GetBuffer"])(a0);
		var _FPDFBitmap_GetStride = Module["_FPDFBitmap_GetStride"] = (a0) => (_FPDFBitmap_GetStride = Module["_FPDFBitmap_GetStride"] = wasmExports["FPDFBitmap_GetStride"])(a0);
		var _FPDFBitmap_Destroy = Module["_FPDFBitmap_Destroy"] = (a0) => (_FPDFBitmap_Destroy = Module["_FPDFBitmap_Destroy"] = wasmExports["FPDFBitmap_Destroy"])(a0);
		var _setThrew = (a0, a1) => (_setThrew = wasmExports["setThrew"])(a0, a1);
		var __emscripten_stack_restore = (a0) => (__emscripten_stack_restore = wasmExports["_emscripten_stack_restore"])(a0);
		var _emscripten_stack_get_current = () => (_emscripten_stack_get_current = wasmExports["emscripten_stack_get_current"])();
		var dynCall_ji = Module["dynCall_ji"] = (a0, a1) => (dynCall_ji = Module["dynCall_ji"] = wasmExports["dynCall_ji"])(a0, a1);
		var dynCall_iiij = Module["dynCall_iiij"] = (a0, a1, a2, a3, a4) => (dynCall_iiij = Module["dynCall_iiij"] = wasmExports["dynCall_iiij"])(a0, a1, a2, a3, a4);
		var dynCall_viijii = Module["dynCall_viijii"] = (a0, a1, a2, a3, a4, a5, a6) => (dynCall_viijii = Module["dynCall_viijii"] = wasmExports["dynCall_viijii"])(a0, a1, a2, a3, a4, a5, a6);
		var dynCall_viijj = Module["dynCall_viijj"] = (a0, a1, a2, a3, a4, a5, a6) => (dynCall_viijj = Module["dynCall_viijj"] = wasmExports["dynCall_viijj"])(a0, a1, a2, a3, a4, a5, a6);
		var dynCall_jji = Module["dynCall_jji"] = (a0, a1, a2, a3) => (dynCall_jji = Module["dynCall_jji"] = wasmExports["dynCall_jji"])(a0, a1, a2, a3);
		var dynCall_iji = Module["dynCall_iji"] = (a0, a1, a2, a3) => (dynCall_iji = Module["dynCall_iji"] = wasmExports["dynCall_iji"])(a0, a1, a2, a3);
		var dynCall_iiji = Module["dynCall_iiji"] = (a0, a1, a2, a3, a4) => (dynCall_iiji = Module["dynCall_iiji"] = wasmExports["dynCall_iiji"])(a0, a1, a2, a3, a4);
		var dynCall_jiji = Module["dynCall_jiji"] = (a0, a1, a2, a3, a4) => (dynCall_jiji = Module["dynCall_jiji"] = wasmExports["dynCall_jiji"])(a0, a1, a2, a3, a4);
		var dynCall_iiiiij = Module["dynCall_iiiiij"] = (a0, a1, a2, a3, a4, a5, a6) => (dynCall_iiiiij = Module["dynCall_iiiiij"] = wasmExports["dynCall_iiiiij"])(a0, a1, a2, a3, a4, a5, a6);
		var dynCall_iiiiijj = Module["dynCall_iiiiijj"] = (a0, a1, a2, a3, a4, a5, a6, a7, a8) => (dynCall_iiiiijj = Module["dynCall_iiiiijj"] = wasmExports["dynCall_iiiiijj"])(a0, a1, a2, a3, a4, a5, a6, a7, a8);
		var dynCall_iiiiiijj = Module["dynCall_iiiiiijj"] = (a0, a1, a2, a3, a4, a5, a6, a7, a8, a9) => (dynCall_iiiiiijj = Module["dynCall_iiiiiijj"] = wasmExports["dynCall_iiiiiijj"])(a0, a1, a2, a3, a4, a5, a6, a7, a8, a9);
		function invoke_iiiii(index, a1, a2, a3, a4) {
			var sp = stackSave();
			try {
				return getWasmTableEntry(index)(a1, a2, a3, a4);
			} catch (e) {
				stackRestore(sp);
				if (e !== e + 0) throw e;
				_setThrew(1, 0);
			}
		}
		function invoke_ii(index, a1) {
			var sp = stackSave();
			try {
				return getWasmTableEntry(index)(a1);
			} catch (e) {
				stackRestore(sp);
				if (e !== e + 0) throw e;
				_setThrew(1, 0);
			}
		}
		function invoke_viii(index, a1, a2, a3) {
			var sp = stackSave();
			try {
				getWasmTableEntry(index)(a1, a2, a3);
			} catch (e) {
				stackRestore(sp);
				if (e !== e + 0) throw e;
				_setThrew(1, 0);
			}
		}
		function invoke_iiii(index, a1, a2, a3) {
			var sp = stackSave();
			try {
				return getWasmTableEntry(index)(a1, a2, a3);
			} catch (e) {
				stackRestore(sp);
				if (e !== e + 0) throw e;
				_setThrew(1, 0);
			}
		}
		function invoke_vii(index, a1, a2) {
			var sp = stackSave();
			try {
				getWasmTableEntry(index)(a1, a2);
			} catch (e) {
				stackRestore(sp);
				if (e !== e + 0) throw e;
				_setThrew(1, 0);
			}
		}
		function invoke_iii(index, a1, a2) {
			var sp = stackSave();
			try {
				return getWasmTableEntry(index)(a1, a2);
			} catch (e) {
				stackRestore(sp);
				if (e !== e + 0) throw e;
				_setThrew(1, 0);
			}
		}
		function invoke_vi(index, a1) {
			var sp = stackSave();
			try {
				getWasmTableEntry(index)(a1);
			} catch (e) {
				stackRestore(sp);
				if (e !== e + 0) throw e;
				_setThrew(1, 0);
			}
		}
		function invoke_v(index) {
			var sp = stackSave();
			try {
				getWasmTableEntry(index)();
			} catch (e) {
				stackRestore(sp);
				if (e !== e + 0) throw e;
				_setThrew(1, 0);
			}
		}
		function invoke_viiii(index, a1, a2, a3, a4) {
			var sp = stackSave();
			try {
				getWasmTableEntry(index)(a1, a2, a3, a4);
			} catch (e) {
				stackRestore(sp);
				if (e !== e + 0) throw e;
				_setThrew(1, 0);
			}
		}
		function invoke_iiiiiii(index, a1, a2, a3, a4, a5, a6) {
			var sp = stackSave();
			try {
				return getWasmTableEntry(index)(a1, a2, a3, a4, a5, a6);
			} catch (e) {
				stackRestore(sp);
				if (e !== e + 0) throw e;
				_setThrew(1, 0);
			}
		}
		function invoke_iiiiii(index, a1, a2, a3, a4, a5) {
			var sp = stackSave();
			try {
				return getWasmTableEntry(index)(a1, a2, a3, a4, a5);
			} catch (e) {
				stackRestore(sp);
				if (e !== e + 0) throw e;
				_setThrew(1, 0);
			}
		}
		Module["setValue"] = setValue;
		Module["getValue"] = getValue;
		Module["stringToUTF8"] = stringToUTF8;
		Module["lengthBytesUTF8"] = lengthBytesUTF8;
		var calledRun;
		dependenciesFulfilled = function runCaller() {
			if (!calledRun) run();
			if (!calledRun) dependenciesFulfilled = runCaller;
		};
		function run() {
			if (runDependencies > 0) return;
			preRun();
			if (runDependencies > 0) return;
			function doRun() {
				if (calledRun) return;
				calledRun = true;
				Module["calledRun"] = true;
				if (ABORT) return;
				initRuntime();
				readyPromiseResolve(Module);
				Module["onRuntimeInitialized"]?.();
				postRun();
			}
			if (Module["setStatus"]) {
				Module["setStatus"]("Running...");
				setTimeout(() => {
					setTimeout(() => Module["setStatus"](""), 1);
					doRun();
				}, 1);
			} else doRun();
		}
		if (Module["preInit"]) {
			if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]];
			while (Module["preInit"].length > 0) Module["preInit"].pop()();
		}
		run();
		moduleRtn = readyPromise;
		return moduleRtn;
	});
})();
//#endregion
//#region src/native/module.ts
async function loadNative(source) {
	const { wasm } = source;
	const where = wasm instanceof Uint8Array ? "the supplied bytes" : String(wasm);
	try {
		const module = await Module(wasm instanceof Uint8Array ? { wasmBinary: wasm } : { locateFile: (path) => path.endsWith(".wasm") ? String(wasm) : path });
		const fn = {};
		for (const name of Object.keys(FUNCTIONS)) {
			const bound = module[`_${name}`];
			if (typeof bound !== "function") throw new Error(`the build does not export ${name}`);
			fn[name] = bound;
		}
		return {
			fn,
			get HEAPU8() {
				return module.HEAPU8;
			},
			get HEAPF32() {
				return module.HEAPF32;
			},
			stringToUTF8: (str, ptr, maxBytes) => {
				module.stringToUTF8(str, ptr, maxBytes);
			},
			lengthBytesUTF8: (str) => module.lengthBytesUTF8(str)
		};
	} catch (cause) {
		if (cause instanceof EngineError) throw cause;
		throw new EngineError("engine-failure", `Could not load the PDF engine from ${where}.`, { cause });
	}
}
//#endregion
//#region src/transport/in-thread.ts
/**
* Runs a request on the core. A render, annotation draw, text read, write or redact first fetches
* the fallback fonts of the pages it loads; that fetch, and a render's or draw's slices, stop
* once `signal` aborts.
* Every other call runs to the end. With no font sources a text read, write or redact runs at
* once, as it did before the engine had fonts.
*/
function dispatch(core, request, signal) {
	switch (request.op) {
		case "open": return core.open(request.bytes, request.options);
		case "pageInfo": return core.pageInfo(request.doc, request.index);
		case "pageText":
			if (!core.fetchesFonts) return core.pageText(request.doc, request.index);
			return core.pageTextAfterFonts(request.doc, request.index, signal);
		case "pageLinks": return core.pageLinks(request.doc, request.index);
		case "documentFacts": return core.documentFacts(request.doc);
		case "pageAnnotations": return core.pageAnnotations(request.doc, request.index);
		case "formFields": return core.formFields(request.doc);
		case "scripts": return core.scripts(request.doc);
		case "structureOrder": return core.structureOrder(request.doc, request.index);
		case "outline": return core.outline(request.doc);
		case "namedDestination": return core.namedDestination(request.doc, request.name);
		case "renderPage": return core.renderPageSliced(request.doc, request.index, request.options, () => signal.aborted, signal);
		case "renderAnnotations": return core.renderAnnotationsSliced(request.doc, request.index, request.options, () => signal.aborted, signal);
		case "write":
			if (!core.fetchesFonts) {
				core.write(request.doc, request.input);
				return;
			}
			return core.writeAfterFonts(request.doc, request.input, signal);
		case "redact":
			if (!core.fetchesFonts) return core.redact(request.doc, request.input);
			return core.redactAfterFonts(request.doc, request.input, signal);
		case "save": return core.save(request.doc, request.mode);
		case "close":
			core.close(request.doc);
			return;
		case "checkRedaction": return core.checkRedaction(request.bytes, request.options);
	}
}
//#endregion
//#region src/transport/worker-host.ts
const STOPPED = "The engine stopped after an internal error; create a new engine.";
function toWire(error) {
	if (error instanceof RangeError) return {
		range: true,
		message: error.message
	};
	if (error instanceof EngineError) return {
		code: error.code,
		message: error.message,
		...error.pdfiumError !== void 0 && { pdfiumError: error.pdfiumError },
		...error.annotation !== void 0 && { annotation: error.annotation },
		...error.page !== void 0 && { page: error.page },
		...error.reason !== void 0 && { reason: error.reason },
		...error.marks !== void 0 && { marks: error.marks },
		...error.kinds !== void 0 && { kinds: error.kinds }
	};
	return {
		code: "engine-failure",
		message: error instanceof Error ? error.message : String(error)
	};
}
/**
* Buffers whose ownership moves to the page along with the result. Only an array that spans its
* whole buffer moves; a view on part of a larger buffer, such as engine memory, is copied.
*/
function transferables(value) {
	if (value instanceof Uint8Array || value instanceof Uint8ClampedArray) return value.byteOffset === 0 && value.byteLength === value.buffer.byteLength ? [value.buffer] : [];
	if (typeof value === "object" && value !== null && "fontTable" in value) {
		const { codes, geometry, flags, fonts } = value;
		return [
			codes,
			geometry,
			flags,
			fonts
		].flatMap((array) => ArrayBuffer.isView(array) && array.byteOffset === 0 && array.byteLength === array.buffer.byteLength ? [array.buffer] : []);
	}
	if (typeof value === "object" && value !== null && "data" in value) return transferables(value.data);
	return [];
}
const loadCore = async (wasm, options) => new EngineCore(await loadNative({ wasm }), options);
/** Answers the page's requests on `scope`. `load` is replaced by tests. */
function serve(scope, load = loadCore) {
	let core;
	/** The calls not yet answered, each aborted once the page asks to stop it. */
	const calls = /* @__PURE__ */ new Map();
	scope.addEventListener("message", (event) => {
		const message = event.data;
		if ("type" in message && message.type === "abort") {
			calls.get(message.id)?.abort();
			return;
		}
		if ("type" in message) {
			core = load(message.wasm, { fallbackFonts: message.fallbackFonts });
			core.then(() => {
				scope.postMessage({ type: "ready" });
			}, (error) => {
				scope.postMessage({
					type: "failed",
					error: toWire(error)
				});
			});
			return;
		}
		const { id, request } = message;
		const call = new AbortController();
		calls.set(id, call);
		(async () => {
			let ready;
			try {
				ready = await core;
				const value = await dispatch(ready, request, call.signal);
				calls.delete(id);
				scope.postMessage({
					id,
					ok: true,
					value
				}, transferables(value));
			} catch (error) {
				calls.delete(id);
				scope.postMessage({
					id,
					ok: false,
					error: toWire(error)
				});
				if (ready?.stopped) scope.postMessage({
					type: "failed",
					error: {
						code: "engine-failure",
						message: STOPPED
					}
				});
			}
		})();
	});
	scope.addEventListener("messageerror", () => {
		scope.postMessage({
			type: "failed",
			error: {
				code: "engine-failure",
				message: "The engine worker could not read a request."
			}
		});
	});
}
//#endregion
//#region src/worker.ts
serve(self);
//#endregion

//# sourceMappingURL=worker.mjs.map