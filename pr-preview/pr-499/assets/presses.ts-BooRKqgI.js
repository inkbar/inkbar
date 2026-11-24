var e={html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * A plugin that hears presses and long presses on the page, written against Inkbar's public</span></span>
<span class="line"><span style="color:#A9AFCB"> * API. Each one is logged with its page, its point in PDF user space and the kind of pointer,</span></span>
<span class="line"><span style="color:#A9AFCB"> * and marked on the page for a moment so you can see where it landed.</span></span>
<span class="line"><span style="color:#A9AFCB"> *</span></span>
<span class="line"><span style="color:#A9AFCB"> * Inkbar reports only the presses it did not act on itself, and only under the select tools:</span></span>
<span class="line"><span style="color:#A9AFCB"> * pressing an annotation, a link or a form field reaches the viewer, not this plugin.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { definePlugin, </span><span style="color:#9DABFF">type</span><span style="color:#C9CEE6"> PagePress, </span><span style="color:#9DABFF">type</span><span style="color:#C9CEE6"> PageTransform } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core/dom'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> interface</span><span style="color:#FFFFFF"> PressesOptions</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#A9AFCB">  /** Called once for each press, with \`onPress\` or \`onLongPress\` as the name. */</span></span>
<span class="line"><span style="color:#FFFFFF">  log</span><span style="color:#C9CEE6">(this</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void, name</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string, payload</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> unknown)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">type</span><span style="color:#FFFFFF"> Kind</span><span style="color:#9DABFF"> =</span><span style="color:#E4FF4A"> 'press'</span><span style="color:#9DABFF"> |</span><span style="color:#E4FF4A"> 'long-press'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">interface</span><span style="color:#FFFFFF"> Marker</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">  kind</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Kind</span></span>
<span class="line"><span style="color:#C9CEE6">  page</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> number</span></span>
<span class="line"><span style="color:#A9AFCB">  /** User space on \`page\`. */</span></span>
<span class="line"><span style="color:#C9CEE6">  x</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> number</span></span>
<span class="line"><span style="color:#C9CEE6">  y</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> number</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">/** How long a marker stays on the page, in ms. */</span></span>
<span class="line"><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> MARKER_MS </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 1500</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">const</span><span style="color:#FFFFFF"> round</span><span style="color:#9DABFF"> =</span><span style="color:#C9CEE6"> (n</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> number) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> Math.</span><span style="color:#FFFFFF">round</span><span style="color:#C9CEE6">(n </span><span style="color:#9DABFF">*</span><span style="color:#E4FF4A"> 10</span><span style="color:#C9CEE6">) </span><span style="color:#9DABFF">/</span><span style="color:#E4FF4A"> 10</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> const</span><span style="color:#C9CEE6"> pressesPlugin </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> definePlugin</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">PressesOptions</span><span style="color:#C9CEE6">>(</span></span>
<span class="line"><span style="color:#E4FF4A">  'presses'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">  (plugin, { log }) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">    const</span><span style="color:#C9CEE6"> markers </span><span style="color:#9DABFF">=</span><span style="color:#9DABFF"> new</span><span style="color:#FFFFFF"> Set</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">Marker</span><span style="color:#C9CEE6">>()</span></span>
<span class="line"><span style="color:#9DABFF">    const</span><span style="color:#C9CEE6"> timers </span><span style="color:#9DABFF">=</span><span style="color:#9DABFF"> new</span><span style="color:#FFFFFF"> Set</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">ReturnType</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#9DABFF">typeof</span><span style="color:#C9CEE6"> setTimeout>>()</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">    // One marker per press, placed through the page transform, so zoom moves it with the page.</span></span>
<span class="line"><span style="color:#9DABFF">    const</span><span style="color:#C9CEE6"> layer </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> plugin.</span><span style="color:#FFFFFF">layer</span><span style="color:#C9CEE6">({</span></span>
<span class="line"><span style="color:#FFFFFF">      render</span><span style="color:#C9CEE6">(el</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLElement</span><span style="color:#C9CEE6">, page</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> number, transform</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> PageTransform</span><span style="color:#C9CEE6">) {</span></span>
<span class="line"><span style="color:#9DABFF">        const</span><span style="color:#C9CEE6"> spans </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> [</span><span style="color:#9DABFF">...</span><span style="color:#C9CEE6">markers]</span></span>
<span class="line"><span style="color:#C9CEE6">          .</span><span style="color:#FFFFFF">filter</span><span style="color:#C9CEE6">((m) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> m.page </span><span style="color:#9DABFF">===</span><span style="color:#C9CEE6"> page)</span></span>
<span class="line"><span style="color:#C9CEE6">          .</span><span style="color:#FFFFFF">map</span><span style="color:#C9CEE6">((m) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">            const</span><span style="color:#C9CEE6"> { x, y } </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> transform.</span><span style="color:#FFFFFF">toCss</span><span style="color:#C9CEE6">({ x: m.x, y: m.y })</span></span>
<span class="line"><span style="color:#9DABFF">            const</span><span style="color:#C9CEE6"> span </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> el.ownerDocument.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'span'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">            span.className </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'presses-marker'</span></span>
<span class="line"><span style="color:#C9CEE6">            span.dataset[</span><span style="color:#E4FF4A">'kind'</span><span style="color:#C9CEE6">] </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> m.kind</span></span>
<span class="line"><span style="color:#C9CEE6">            span.style.left </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> \`\${</span><span style="color:#E4FF4A">x</span><span style="color:#E4FF4A">}px\`</span></span>
<span class="line"><span style="color:#C9CEE6">            span.style.top </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> \`\${</span><span style="color:#E4FF4A">y</span><span style="color:#E4FF4A">}px\`</span></span>
<span class="line"><span style="color:#9DABFF">            return</span><span style="color:#C9CEE6"> span</span></span>
<span class="line"><span style="color:#C9CEE6">          })</span></span>
<span class="line"><span style="color:#C9CEE6">        el.</span><span style="color:#FFFFFF">replaceChildren</span><span style="color:#C9CEE6">(</span><span style="color:#9DABFF">...</span><span style="color:#C9CEE6">spans)</span></span>
<span class="line"><span style="color:#C9CEE6">      },</span></span>
<span class="line"><span style="color:#C9CEE6">    })</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">    const</span><span style="color:#C9CEE6"> heard </span><span style="color:#9DABFF">=</span></span>
<span class="line"><span style="color:#C9CEE6">      (kind</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Kind</span><span style="color:#C9CEE6">, name</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string) </span><span style="color:#9DABFF">=></span></span>
<span class="line"><span style="color:#C9CEE6">      ({ page, point, pointerType }</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> PagePress</span><span style="color:#C9CEE6">) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">        const</span><span style="color:#C9CEE6"> x </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> round</span><span style="color:#C9CEE6">(point.x)</span></span>
<span class="line"><span style="color:#9DABFF">        const</span><span style="color:#C9CEE6"> y </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> round</span><span style="color:#C9CEE6">(point.y)</span></span>
<span class="line"><span style="color:#FFFFFF">        log</span><span style="color:#C9CEE6">(name, { page, point: { x, y }, pointerType })</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">        const</span><span style="color:#C9CEE6"> marker</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Marker</span><span style="color:#9DABFF"> =</span><span style="color:#C9CEE6"> { kind, page, x, y }</span></span>
<span class="line"><span style="color:#C9CEE6">        markers.</span><span style="color:#FFFFFF">add</span><span style="color:#C9CEE6">(marker)</span></span>
<span class="line"><span style="color:#C9CEE6">        layer.</span><span style="color:#FFFFFF">invalidate</span><span style="color:#C9CEE6">(page)</span></span>
<span class="line"><span style="color:#9DABFF">        const</span><span style="color:#C9CEE6"> timer </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> setTimeout</span><span style="color:#C9CEE6">(() </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">          timers.</span><span style="color:#FFFFFF">delete</span><span style="color:#C9CEE6">(timer)</span></span>
<span class="line"><span style="color:#C9CEE6">          markers.</span><span style="color:#FFFFFF">delete</span><span style="color:#C9CEE6">(marker)</span></span>
<span class="line"><span style="color:#C9CEE6">          layer.</span><span style="color:#FFFFFF">invalidate</span><span style="color:#C9CEE6">(page)</span></span>
<span class="line"><span style="color:#C9CEE6">        }, MARKER_MS)</span></span>
<span class="line"><span style="color:#C9CEE6">        timers.</span><span style="color:#FFFFFF">add</span><span style="color:#C9CEE6">(timer)</span></span>
<span class="line"><span style="color:#C9CEE6">      }</span></span>
<span class="line"></span>
<span class="line"><span style="color:#C9CEE6">    plugin.</span><span style="color:#FFFFFF">onPress</span><span style="color:#C9CEE6">(</span><span style="color:#FFFFFF">heard</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'press'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'onPress'</span><span style="color:#C9CEE6">))</span></span>
<span class="line"><span style="color:#C9CEE6">    plugin.</span><span style="color:#FFFFFF">onLongPress</span><span style="color:#C9CEE6">(</span><span style="color:#FFFFFF">heard</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'long-press'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'onLongPress'</span><span style="color:#C9CEE6">))</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">    return</span><span style="color:#C9CEE6"> () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">      for</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> timer </span><span style="color:#9DABFF">of</span><span style="color:#C9CEE6"> timers) </span><span style="color:#FFFFFF">clearTimeout</span><span style="color:#C9CEE6">(timer)</span></span>
<span class="line"><span style="color:#C9CEE6">    }</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#C9CEE6">)</span></span>
<span class="line"></span></code></pre>`,code:`/*
 * A plugin that hears presses and long presses on the page, written against Inkbar's public
 * API. Each one is logged with its page, its point in PDF user space and the kind of pointer,
 * and marked on the page for a moment so you can see where it landed.
 *
 * Inkbar reports only the presses it did not act on itself, and only under the select tools:
 * pressing an annotation, a link or a form field reaches the viewer, not this plugin.
 */
import { definePlugin, type PagePress, type PageTransform } from '@inkbar/core/dom'

export interface PressesOptions {
  /** Called once for each press, with \`onPress\` or \`onLongPress\` as the name. */
  log(this: void, name: string, payload: unknown): void
}

type Kind = 'press' | 'long-press'

interface Marker {
  kind: Kind
  page: number
  /** User space on \`page\`. */
  x: number
  y: number
}

/** How long a marker stays on the page, in ms. */
const MARKER_MS = 1500

const round = (n: number) => Math.round(n * 10) / 10

export const pressesPlugin = definePlugin<PressesOptions>(
  'presses',
  (plugin, { log }) => {
    const markers = new Set<Marker>()
    const timers = new Set<ReturnType<typeof setTimeout>>()

    // One marker per press, placed through the page transform, so zoom moves it with the page.
    const layer = plugin.layer({
      render(el: HTMLElement, page: number, transform: PageTransform) {
        const spans = [...markers]
          .filter((m) => m.page === page)
          .map((m) => {
            const { x, y } = transform.toCss({ x: m.x, y: m.y })
            const span = el.ownerDocument.createElement('span')
            span.className = 'presses-marker'
            span.dataset['kind'] = m.kind
            span.style.left = \`\${x}px\`
            span.style.top = \`\${y}px\`
            return span
          })
        el.replaceChildren(...spans)
      },
    })

    const heard =
      (kind: Kind, name: string) =>
      ({ page, point, pointerType }: PagePress) => {
        const x = round(point.x)
        const y = round(point.y)
        log(name, { page, point: { x, y }, pointerType })

        const marker: Marker = { kind, page, x, y }
        markers.add(marker)
        layer.invalidate(page)
        const timer = setTimeout(() => {
          timers.delete(timer)
          markers.delete(marker)
          layer.invalidate(page)
        }, MARKER_MS)
        timers.add(timer)
      }

    plugin.onPress(heard('press', 'onPress'))
    plugin.onLongPress(heard('long-press', 'onLongPress'))

    return () => {
      for (const timer of timers) clearTimeout(timer)
    }
  }
)
`};export{e as default};