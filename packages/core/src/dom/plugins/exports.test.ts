/*
 * Plugins live in other repos and list `@inkbar/core` as a peer dependency, so every named type
 * a plugin can touch must be importable from `@inkbar/core` or `@inkbar/core/dom`. This walks the
 * declared types of the plugin entry points with the TypeScript compiler and fails with the
 * names of any that are not exported.
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

const coreRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const srcRoot = resolve(coreRoot, 'src')

/** Types that are internal on purpose and referenced by a public one. Keep empty if you can. */
const INTERNAL_ALLOWLIST: readonly string[] = []

function createProgram(): ts.Program {
  const configPath = resolve(coreRoot, 'tsconfig.json')
  const config = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path))
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, coreRoot)
  return ts.createProgram({
    rootNames: [resolve(srcRoot, 'index.ts'), resolve(srcRoot, 'dom/index.ts')],
    options: parsed.options,
  })
}

describe('plugin type exports', () => {
  it('exports every named type reachable from the plugin entry points', () => {
    const program = createProgram()
    const checker = program.getTypeChecker()

    const resolveAlias = (symbol: ts.Symbol) =>
      symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol

    const exported = new Set<ts.Symbol>()
    for (const file of ['index.ts', 'dom/index.ts']) {
      const source = program.getSourceFile(resolve(srcRoot, file))!
      const moduleSymbol = checker.getSymbolAtLocation(source)!
      for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
        exported.add(resolveAlias(symbol))
      }
    }

    const fileOf = (symbol: ts.Symbol) =>
      symbol.declarations?.[0]?.getSourceFile().fileName ?? ''
    // Own named types: declared with `export` in this package's source (not a lib or a
    // dependency). A module-private alias cannot be imported by anyone, and the compiler
    // expands it where a plugin author's declarations need it.
    const isOwnType = (symbol: ts.Symbol) =>
      (symbol.declarations ?? []).some(
        (d) =>
          (ts.isInterfaceDeclaration(d) ||
            ts.isTypeAliasDeclaration(d) ||
            ts.isClassDeclaration(d)) &&
          (ts.getCombinedModifierFlags(d) & ts.ModifierFlags.Export) !== 0 &&
          d.getSourceFile().fileName.startsWith(srcRoot + '/')
      )
    const isForeign = (symbol: ts.Symbol) => {
      const file = fileOf(symbol)
      return file.includes('/node_modules/') || /\/lib\.[^/]*\.d\.ts$/.test(file)
    }
    const isInternal = (symbol: ts.Symbol) =>
      symbol.getJsDocTags(checker).some((tag) => tag.name === 'internal')

    const found = new Map<ts.Symbol, string>()
    const seenTypes = new Set<ts.Type>()
    const seenSymbols = new Set<ts.Symbol>()

    function note(symbol: ts.Symbol | undefined): void {
      if (!symbol || !isOwnType(symbol) || isInternal(symbol)) return
      found.set(symbol, symbol.getName())
    }

    function visitSymbol(symbol: ts.Symbol, at: ts.Node): void {
      visit(checker.getTypeOfSymbolAtLocation(symbol, at), at)
    }

    function visitSignature(signature: ts.Signature, at: ts.Node): void {
      for (const param of signature.getParameters()) visitSymbol(param, at)
      for (const tp of signature.getTypeParameters() ?? []) visit(tp, at)
      visit(signature.getReturnType(), at)
    }

    function visit(type: ts.Type, at: ts.Node): void {
      if (seenTypes.has(type)) return
      seenTypes.add(type)
      note(type.aliasSymbol)
      for (const arg of type.aliasTypeArguments ?? []) visit(arg, at)
      if (type.isUnionOrIntersection()) {
        for (const t of type.types) visit(t, at)
        return
      }
      if (type.flags & ts.TypeFlags.TypeParameter) {
        const constraint = type.getConstraint()
        if (constraint) visit(constraint, at)
        return
      }
      if (type.flags & ts.TypeFlags.Index) {
        visit((type as ts.IndexType).type, at)
        return
      }
      if (type.flags & ts.TypeFlags.IndexedAccess) {
        visit((type as ts.IndexedAccessType).objectType, at)
        visit((type as ts.IndexedAccessType).indexType, at)
        return
      }
      if (type.flags & ts.TypeFlags.Conditional) {
        const c = type as ts.ConditionalType
        visit(c.checkType, at)
        visit(c.extendsType, at)
        return
      }
      if (!(type.flags & ts.TypeFlags.Object)) return
      const objectType = type as ts.ObjectType
      const isReference = (objectType.objectFlags & ts.ObjectFlags.Reference) !== 0
      if (isReference) {
        for (const arg of checker.getTypeArguments(type as ts.TypeReference))
          visit(arg, at)
      }
      const symbol = type.getSymbol()
      if (symbol) {
        note(symbol)
        // Members of lib and dependency types are not ours to export.
        if (isForeign(symbol)) return
        // Walk a declaration's members once, whatever type arguments it was reached with.
        if (seenSymbols.has(symbol) && isOwnType(symbol)) return
        seenSymbols.add(symbol)
      }
      for (const prop of checker.getPropertiesOfType(type)) visitSymbol(prop, at)
      for (const sig of type.getCallSignatures()) visitSignature(sig, at)
      for (const sig of type.getConstructSignatures()) visitSignature(sig, at)
      for (const info of checker.getIndexInfosOfType(type)) {
        visit(info.keyType, at)
        visit(info.type, at)
      }
      for (const base of type.getBaseTypes?.() ?? []) visit(base, at)
    }

    const define = program.getSourceFile(resolve(srcRoot, 'dom/plugins/define.ts'))!
    const api = program.getSourceFile(resolve(srcRoot, 'dom/plugins/api/api.ts'))!
    const entry = (file: ts.SourceFile, name: string) => {
      const symbol = checker
        .getExportsOfModule(checker.getSymbolAtLocation(file)!)
        .find((s) => s.getName() === name)
      expect(symbol, `${name} is declared in ${file.fileName}`).toBeDefined()
      return symbol!
    }

    for (const [file, name] of [
      [define, 'InkPlugin'],
      [define, 'PluginContext'],
      [api, 'PluginApi'],
      [api, 'PluginOptions'],
    ] as const) {
      const symbol = entry(file, name)
      note(symbol)
      visit(checker.getDeclaredTypeOfSymbol(symbol), file)
    }
    // Every overload of `definePlugin`, the factory form included.
    const definePlugin = entry(define, 'definePlugin')
    for (const sig of checker
      .getTypeOfSymbolAtLocation(definePlugin, define)
      .getCallSignatures()) {
      visitSignature(sig, define)
    }

    expect(found.size, 'the walk found the plugin types').toBeGreaterThan(20)
    const missing = [...found]
      .filter(
        ([symbol, name]) => !exported.has(symbol) && !INTERNAL_ALLOWLIST.includes(name)
      )
      .map(([, name]) => name)
      .sort()
    expect(missing, 'named types a plugin can reach but cannot import').toEqual([])
  }, 60_000)
})
