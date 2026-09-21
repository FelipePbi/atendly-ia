package transportguard

import (
	"go/ast"
	"go/token"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

// OriginKind says where the type of an expression was declared. It is the
// only thing the site classifier needs in order to tell "our own code"
// from "the transport library" without a hand-written list of receivers.
type OriginKind int

const (
	// OriginUnknown means the guard could not resolve the expression to a
	// declared type. On a path that carries text it is a hard failure.
	OriginUnknown OriginKind = iota
	// OriginProduction is a type declared inside the evolution-go
	// production tree.
	OriginProduction
	// OriginTransportLibrary is a type declared in the transport library
	// package itself — the client that owns the socket to WhatsApp.
	OriginTransportLibrary
	// OriginProto is a type declared in the generated message package.
	OriginProto
	// OriginOtherPackage is a type from some other imported package.
	OriginOtherPackage
)

// Origin is a resolved type reference: its kind plus, for a production
// type, the package directory and name needed to look up its fields and
// methods.
type Origin struct {
	Kind   OriginKind
	PkgDir string
	Name   string
	// ImportPath is the package the type was written as qualified by,
	// when it was written that way. It is kept so a reader of the
	// enumeration can see which package a value came from.
	ImportPath string
}

// typeIndex holds every type, method and function declaration of the
// production tree, keyed by the directory of the file that declares it.
// Directory is the package identity here because two packages in
// different directories may declare the same type name.
type typeIndex struct {
	structs map[string]map[string]*ast.StructType
	// ifaces holds the interface declarations of the production tree.
	// An interface is how one package names a dependency it does not
	// declare, so following a call chain across packages means resolving
	// from the interface to the type in that package that implements it.
	ifaces  map[string]map[string]*ast.InterfaceType
	methods map[string]map[string]map[string]*ast.FuncDecl
	funcs   map[string]map[string]*ast.FuncDecl
	// declScope is the file scope of the file that declares each type or
	// function, so a type written in another package is read with that
	// package's own imports instead of the caller's.
	declScope map[string]map[string]*fileScope
}

func buildTypeIndex(files map[string]*ast.File) *typeIndex {
	index := &typeIndex{
		structs:   map[string]map[string]*ast.StructType{},
		ifaces:    map[string]map[string]*ast.InterfaceType{},
		methods:   map[string]map[string]map[string]*ast.FuncDecl{},
		funcs:     map[string]map[string]*ast.FuncDecl{},
		declScope: map[string]map[string]*fileScope{},
	}
	// Files are read in a fixed order, and type declarations are read
	// before function declarations, because the scope a type is read
	// with has to be the scope of the file that declares the type. A
	// method written in another file of the same package does not
	// import what the type own file imports, and letting a method
	// overwrite the type declaration scope made the result depend on
	// which file happened to be visited last.
	paths := make([]string, 0, len(files))
	for path := range files {
		paths = append(paths, path)
	}
	sort.Strings(paths)

	scopes := make(map[string]*fileScope, len(files))
	for _, path := range paths {
		dir := filepath.Dir(path)
		file := files[path]
		scope := newFileScope(path, file)
		scopes[path] = scope
		if index.declScope[dir] == nil {
			index.declScope[dir] = map[string]*fileScope{}
		}
		for _, decl := range file.Decls {
			genDecl, ok := decl.(*ast.GenDecl)
			if !ok || genDecl.Tok != token.TYPE {
				continue
			}
			for _, spec := range genDecl.Specs {
				typeSpec, ok := spec.(*ast.TypeSpec)
				if !ok {
					continue
				}
				if ifaceType, ok := typeSpec.Type.(*ast.InterfaceType); ok {
					if index.ifaces[dir] == nil {
						index.ifaces[dir] = map[string]*ast.InterfaceType{}
					}
					index.ifaces[dir][typeSpec.Name.Name] = ifaceType
					index.declScope[dir][typeSpec.Name.Name] = scope
					continue
				}
				structType, ok := typeSpec.Type.(*ast.StructType)
				if !ok {
					continue
				}
				if index.structs[dir] == nil {
					index.structs[dir] = map[string]*ast.StructType{}
				}
				index.structs[dir][typeSpec.Name.Name] = structType
				index.declScope[dir][typeSpec.Name.Name] = scope
			}
		}
	}

	for _, path := range paths {
		dir := filepath.Dir(path)
		file := files[path]
		scope := scopes[path]
		for _, decl := range file.Decls {
			d, ok := decl.(*ast.FuncDecl)
			if !ok {
				continue
			}
			if d.Recv == nil || len(d.Recv.List) == 0 {
				if index.funcs[dir] == nil {
					index.funcs[dir] = map[string]*ast.FuncDecl{}
				}
				index.funcs[dir][d.Name.Name] = d
				if _, declared := index.declScope[dir][d.Name.Name]; !declared {
					index.declScope[dir][d.Name.Name] = scope
				}
				continue
			}
			recvType := baseTypeName(d.Recv.List[0].Type)
			if recvType == "" {
				continue
			}
			if index.methods[dir] == nil {
				index.methods[dir] = map[string]map[string]*ast.FuncDecl{}
			}
			if index.methods[dir][recvType] == nil {
				index.methods[dir][recvType] = map[string]*ast.FuncDecl{}
			}
			index.methods[dir][recvType][d.Name.Name] = d
			// The scope of a type is the scope of the file that
			// declares the type. A method only fills the gap when no
			// declaration was found for that name at all.
			if _, declared := index.declScope[dir][recvType]; !declared {
				index.declScope[dir][recvType] = scope
			}
		}
	}
	return index
}

// baseTypeName strips pointer, slice, map and generic wrappers until it
// reaches a plain identifier, and returns the empty string for anything
// qualified by a package, which is by definition not a local type name.
func baseTypeName(expr ast.Expr) string {
	switch t := expr.(type) {
	case *ast.StarExpr:
		return baseTypeName(t.X)
	case *ast.ArrayType:
		return baseTypeName(t.Elt)
	case *ast.MapType:
		return baseTypeName(t.Value)
	case *ast.Ident:
		return t.Name
	case *ast.IndexExpr:
		return baseTypeName(t.X)
	case *ast.IndexListExpr:
		return baseTypeName(t.X)
	}
	return ""
}

// fileScope is what the resolver needs about the file it is reading: the
// package directory it belongs to and the local name of each import.
type fileScope struct {
	path    string
	dir     string
	file    *ast.File
	imports map[string]string
}

func newFileScope(path string, file *ast.File) *fileScope {
	scope := &fileScope{
		path:    path,
		dir:     filepath.Dir(path),
		file:    file,
		imports: map[string]string{},
	}
	for _, spec := range file.Imports {
		importPath, err := strconv.Unquote(spec.Path.Value)
		if err != nil {
			continue
		}
		name := lastSegment(importPath)
		if spec.Name != nil {
			name = spec.Name.Name
		}
		scope.imports[name] = importPath
	}
	return scope
}

func lastSegment(importPath string) string {
	segments := strings.Split(importPath, "/")
	return segments[len(segments)-1]
}

// resolver turns an expression into the Origin of its type using only
// declarations found in the tree: the enclosing receiver, parameters,
// local assignments, struct fields and function results. It never
// consults a list of file, folder, function, route or receiver names.
type resolver struct {
	index   *typeIndex
	library *libraryIndex
	proto   *protoIndex
	paths   TransportPackagePaths
	// modulePath and moduleRoot come from go.mod, and are what turns an
	// import path written in a file into the directory of the package it
	// names. Without them a type qualified by its own module ("
	// send_handler.SendHandler") would read as an outside package.
	modulePath string
	moduleRoot string
}

// productionPkgDir maps an import path to the directory of the package it
// names, when that package belongs to this module. It is derived from
// go.mod, never from a list of package names.
func (r *resolver) productionPkgDir(importPath string) (string, bool) {
	if r.modulePath == "" || r.moduleRoot == "" {
		return "", false
	}
	if importPath == r.modulePath {
		return r.moduleRoot, true
	}
	prefix := r.modulePath + "/"
	if !strings.HasPrefix(importPath, prefix) {
		return "", false
	}
	return filepath.Join(r.moduleRoot, filepath.FromSlash(strings.TrimPrefix(importPath, prefix))), true
}

// originOfTypeExpr classifies a type expression as written in scope.
func (r *resolver) originOfTypeExpr(scope *fileScope, expr ast.Expr) Origin {
	switch t := expr.(type) {
	case *ast.StarExpr:
		return r.originOfTypeExpr(scope, t.X)
	case *ast.ArrayType:
		return r.originOfTypeExpr(scope, t.Elt)
	case *ast.MapType:
		return r.originOfTypeExpr(scope, t.Value)
	case *ast.Ellipsis:
		return r.originOfTypeExpr(scope, t.Elt)
	case *ast.SelectorExpr:
		pkgIdent, ok := t.X.(*ast.Ident)
		if !ok {
			return Origin{Kind: OriginUnknown}
		}
		importPath, ok := scope.imports[pkgIdent.Name]
		if !ok {
			return Origin{Kind: OriginUnknown}
		}
		switch importPath {
		case r.paths.Library:
			return Origin{Kind: OriginTransportLibrary, Name: t.Sel.Name, ImportPath: importPath}
		case r.paths.Proto:
			return Origin{Kind: OriginProto, Name: t.Sel.Name, ImportPath: importPath}
		}
		if dir, ok := r.productionPkgDir(importPath); ok {
			return Origin{Kind: OriginProduction, PkgDir: dir, Name: t.Sel.Name, ImportPath: importPath}
		}
		return Origin{Kind: OriginOtherPackage, Name: t.Sel.Name, ImportPath: importPath}
	case *ast.Ident:
		// An unqualified type name belongs to the package of the file that
		// writes it, so a name written inside the transport library is a
		// transport library type without any name being listed here.
		if r.proto != nil && scope.dir == r.proto.dir {
			return Origin{Kind: OriginProto, Name: t.Name}
		}
		if r.library != nil && scope.dir == r.library.dir {
			return Origin{Kind: OriginTransportLibrary, Name: t.Name}
		}
		if r.index.structs[scope.dir][t.Name] != nil || r.index.methods[scope.dir][t.Name] != nil {
			return Origin{Kind: OriginProduction, PkgDir: scope.dir, Name: t.Name}
		}
		return Origin{Kind: OriginUnknown, Name: t.Name}
	}
	return Origin{Kind: OriginUnknown}
}

// originOfValueExpr classifies the value an expression evaluates to,
// inside function fn of the given file scope.
func (r *resolver) originOfValueExpr(scope *fileScope, fn *ast.FuncDecl, expr ast.Expr, depth int) Origin {
	if depth > maxResolveDepth {
		return Origin{Kind: OriginUnknown}
	}
	switch e := expr.(type) {
	case *ast.ParenExpr:
		return r.originOfValueExpr(scope, fn, e.X, depth+1)
	case *ast.StarExpr:
		return r.originOfValueExpr(scope, fn, e.X, depth+1)
	case *ast.UnaryExpr:
		return r.originOfValueExpr(scope, fn, e.X, depth+1)
	case *ast.IndexExpr:
		return r.originOfValueExpr(scope, fn, e.X, depth+1)
	case *ast.CompositeLit:
		return r.originOfTypeExpr(scope, e.Type)
	case *ast.Ident:
		return r.originOfIdent(scope, fn, e, depth)
	case *ast.SelectorExpr:
		// A package-qualified name is a type or value of that package, not
		// a field access; try that reading first.
		if pkgIdent, ok := e.X.(*ast.Ident); ok {
			if _, isImport := scope.imports[pkgIdent.Name]; isImport && !r.identIsLocal(scope, fn, pkgIdent) {
				return r.originOfTypeExpr(scope, e)
			}
		}
		base := r.originOfValueExpr(scope, fn, e.X, depth+1)
		if base.Kind == OriginProto && r.proto != nil {
			return r.fieldOrigin(r.proto.structs[base.Name], r.proto.scope, e.Sel.Name)
		}
		if base.Kind != OriginProduction {
			return Origin{Kind: OriginUnknown}
		}
		structType := r.index.structs[base.PkgDir][base.Name]
		if structType == nil {
			return Origin{Kind: OriginUnknown}
		}
		return r.fieldOrigin(structType, r.declScopeOf(base.PkgDir, base.Name, scope), e.Sel.Name)
	case *ast.CallExpr:
		decl, declScope := r.calleeDecl(scope, fn, e, depth)
		if decl == nil || decl.Type.Results == nil || len(decl.Type.Results.List) == 0 {
			return Origin{Kind: OriginUnknown}
		}
		return r.originOfTypeExpr(declScope, decl.Type.Results.List[0].Type)
	}
	return Origin{Kind: OriginUnknown}
}

const maxResolveDepth = 12

// originOfIdent resolves a bare identifier: the enclosing method
// receiver, a parameter, a named result, or the right-hand side of the
// assignment that binds it inside fn.
func (r *resolver) originOfIdent(scope *fileScope, fn *ast.FuncDecl, ident *ast.Ident, depth int) Origin {
	if fn == nil {
		return Origin{Kind: OriginUnknown}
	}
	for _, field := range fieldLists(fn) {
		for _, name := range field.Names {
			if name.Name == ident.Name {
				return r.originOfTypeExpr(scope, field.Type)
			}
		}
	}
	var origin Origin
	ast.Inspect(fn.Body, func(n ast.Node) bool {
		if origin.Kind != OriginUnknown {
			return false
		}
		assign, ok := n.(*ast.AssignStmt)
		if !ok {
			return true
		}
		for i, lhs := range assign.Lhs {
			lhsIdent, ok := lhs.(*ast.Ident)
			if !ok || lhsIdent.Name != ident.Name {
				continue
			}
			switch {
			case len(assign.Rhs) == len(assign.Lhs):
				origin = r.originOfValueExpr(scope, fn, assign.Rhs[i], depth+1)
			case len(assign.Rhs) == 1 && i == 0:
				origin = r.originOfValueExpr(scope, fn, assign.Rhs[0], depth+1)
			}
			if origin.Kind != OriginUnknown {
				return false
			}
		}
		return true
	})
	return origin
}

// identIsLocal reports whether ident names something bound inside fn —
// a receiver, a parameter or an assigned variable — which is how a local
// variable that shadows an imported package name is told apart.
func (r *resolver) identIsLocal(scope *fileScope, fn *ast.FuncDecl, ident *ast.Ident) bool {
	if fn == nil {
		return false
	}
	for _, field := range fieldLists(fn) {
		for _, name := range field.Names {
			if name.Name == ident.Name {
				return true
			}
		}
	}
	local := false
	ast.Inspect(fn.Body, func(n ast.Node) bool {
		if local {
			return false
		}
		assign, ok := n.(*ast.AssignStmt)
		if !ok {
			return true
		}
		for _, lhs := range assign.Lhs {
			if lhsIdent, ok := lhs.(*ast.Ident); ok && lhsIdent.Name == ident.Name {
				local = true
				return false
			}
		}
		return true
	})
	return local
}

func fieldLists(fn *ast.FuncDecl) []*ast.Field {
	var fields []*ast.Field
	if fn.Recv != nil {
		fields = append(fields, fn.Recv.List...)
	}
	if fn.Type.Params != nil {
		fields = append(fields, fn.Type.Params.List...)
	}
	if fn.Type.Results != nil {
		fields = append(fields, fn.Type.Results.List...)
	}
	return fields
}

// fieldOrigin resolves the declared type of one field of a struct.
func (r *resolver) fieldOrigin(structType *ast.StructType, scope *fileScope, fieldName string) Origin {
	if structType == nil {
		return Origin{Kind: OriginUnknown}
	}
	for _, field := range structType.Fields.List {
		for _, name := range field.Names {
			if name.Name == fieldName {
				return r.originOfTypeExpr(scope, field.Type)
			}
		}
	}
	return Origin{Kind: OriginUnknown}
}

// declScopeOf returns the file scope of the file that declares name in
// package directory dir, falling back to the caller's scope when the
// declaration is not in the production tree.
func (r *resolver) declScopeOf(dir, name string, fallback *fileScope) *fileScope {
	if scope, ok := r.index.declScope[dir][name]; ok {
		return scope
	}
	return fallback
}

// calleeDecl finds the declaration a call resolves to when that
// declaration lives in the production tree, together with the file scope
// it was declared in. It returns nil for anything external, which is
// exactly what the classifier needs to know.
func (r *resolver) calleeDecl(scope *fileScope, fn *ast.FuncDecl, call *ast.CallExpr, depth int) (*ast.FuncDecl, *fileScope) {
	switch callee := call.Fun.(type) {
	case *ast.Ident:
		decl := r.index.funcs[scope.dir][callee.Name]
		return decl, r.declScopeOf(scope.dir, callee.Name, scope)
	case *ast.SelectorExpr:
		recv := r.originOfValueExpr(scope, fn, callee.X, depth+1)
		switch recv.Kind {
		case OriginProduction:
			decl, declScope := r.methodDecl(recv.PkgDir, recv.Name, callee.Sel.Name)
			if decl == nil {
				return nil, scope
			}
			return decl, declScope
		case OriginTransportLibrary:
			if r.library == nil {
				return nil, scope
			}
			decl := r.library.methods[recv.Name][callee.Sel.Name]
			if decl == nil {
				return nil, scope
			}
			return decl, r.library.scopes[decl]
		}
		return nil, scope
	}
	return nil, scope
}

// methodDecl finds the declaration of methodName on the production type
// typeName of the package in dir.
//
// When typeName names an interface, the search moves on: an interface is
// how one package names a dependency it does not declare, so the
// declaration that runs belongs to the type in that same package which
// declares the method the interface names. Exactly one such type is
// required — two would make the chain ambiguous, and an ambiguous chain
// is refused rather than guessed at.
func (r *resolver) methodDecl(dir, typeName, methodName string) (*ast.FuncDecl, *fileScope) {
	if decl := r.index.methods[dir][typeName][methodName]; decl != nil {
		return decl, r.declScopeOf(dir, typeName, nil)
	}
	iface := r.index.ifaces[dir][typeName]
	if iface == nil || !interfaceDeclaresMethod(iface, methodName) {
		return nil, nil
	}
	var (
		found      *ast.FuncDecl
		foundScope *fileScope
		matches    int
	)
	for recvType, methods := range r.index.methods[dir] {
		decl := methods[methodName]
		if decl == nil || r.index.ifaces[dir][recvType] != nil {
			continue
		}
		found = decl
		foundScope = r.declScopeOf(dir, recvType, nil)
		matches++
	}
	if matches != 1 {
		return nil, nil
	}
	return found, foundScope
}

// interfaceDeclaresMethod reports whether the interface declaration names
// methodName among its own methods.
func interfaceDeclaresMethod(iface *ast.InterfaceType, methodName string) bool {
	if iface.Methods == nil {
		return false
	}
	for _, field := range iface.Methods.List {
		for _, name := range field.Names {
			if name.Name == methodName {
				return true
			}
		}
	}
	return false
}
