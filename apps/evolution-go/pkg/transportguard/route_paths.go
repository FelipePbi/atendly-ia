package transportguard

import (
	"fmt"
	"go/ast"
	"go/token"
	"sort"
	"strconv"
	"strings"
)

// RegisteredRoute is one HTTP route this production tree registers, with
// its full path already assembled from the group it was registered
// inside and the path written at the registration. Both halves are read
// from the syntax tree; neither the prefix nor the path is written down
// inside this guard.
type RegisteredRoute struct {
	File string
	Line int
	// Method is the name of the registration call, which is the HTTP
	// verb the router library spells its registration methods with. It
	// is read off the call, never compared against a list.
	Method string
	// GroupPrefix is the path of the group the registration was made on,
	// assembled from every group the group itself was derived from.
	GroupPrefix string
	// RegisteredPath is the path literal written at the registration.
	RegisteredPath string
	// FullPath is GroupPrefix followed by RegisteredPath: the path a
	// client calls.
	FullPath string
	// HandlerType and HandlerName name the production method registered
	// as the handler, and HandlerFile/HandlerLine locate its
	// declaration. They are empty when the last argument is not a method
	// this tree declares — a library handler, for instance — and the
	// route is still enumerated, with the reason written.
	HandlerType string
	HandlerName string
	HandlerFile string
	HandlerLine int
	Reason      string
}

// Position renders the registration as "file:line".
func (r RegisteredRoute) Position() string {
	return fmt.Sprintf("%s:%d", r.File, r.Line)
}

// routerBindings tracks, inside one function, which local names hold a
// router and which path prefix each of them carries.
type routerBindings map[string]string

// discoverRegisteredRoutes walks every production function and assembles
// the full path of every route registration it finds.
//
// The recognition is by shape, in three parts and no names:
//   - a router is a value whose type comes from a package outside this
//     module, or a value derived from one of those by a grouping call;
//   - a grouping call is a call on a router whose first argument is a
//     path literal and whose result is bound to a name, which makes that
//     name a router carrying the joined prefix;
//   - a registration is a call on a router whose first argument is a
//     path literal and whose last argument is a method value rather than
//     a call, which is what a handler is.
func (d *discoverer) discoverRegisteredRoutes() {
	for _, path := range d.order {
		file := d.files[path]
		scope := newFileScope(path, file)
		for _, decl := range file.Decls {
			fn, ok := decl.(*ast.FuncDecl)
			if !ok || fn.Body == nil {
				continue
			}
			d.collectRoutesIn(scope, fn)
		}
	}
	sort.SliceStable(d.routes, func(i, j int) bool {
		if d.routes[i].File != d.routes[j].File {
			return d.routes[i].File < d.routes[j].File
		}
		return d.routes[i].Line < d.routes[j].Line
	})
}

func (d *discoverer) collectRoutesIn(scope *fileScope, fn *ast.FuncDecl) {
	bindings := routerBindings{}
	// Statements are visited in source order, which is what makes a
	// group variable that is reassigned resolve against the group that
	// was in force where the registration was written.
	ast.Inspect(fn.Body, func(n ast.Node) bool {
		switch stmt := n.(type) {
		case *ast.AssignStmt:
			d.bindRouterGroup(scope, fn, bindings, stmt)
		case *ast.ExprStmt:
			call, ok := stmt.X.(*ast.CallExpr)
			if !ok {
				return true
			}
			d.recordRegistration(scope, fn, bindings, call)
		}
		return true
	})
}

// bindRouterGroup records a name bound to the result of a grouping call.
func (d *discoverer) bindRouterGroup(scope *fileScope, fn *ast.FuncDecl, bindings routerBindings, assign *ast.AssignStmt) {
	if len(assign.Lhs) != 1 || len(assign.Rhs) != 1 {
		return
	}
	name := baseIdentName(assign.Lhs[0])
	if name == "" {
		return
	}
	call, ok := assign.Rhs[0].(*ast.CallExpr)
	if !ok {
		return
	}
	selector, ok := call.Fun.(*ast.SelectorExpr)
	if !ok || len(call.Args) == 0 {
		return
	}
	literal, ok := pathLiteral(call.Args[0])
	if !ok {
		return
	}
	prefix, ok := d.routerPrefix(scope, fn, bindings, selector.X)
	if !ok {
		return
	}
	bindings[name] = prefix + literal
}

// recordRegistration records a call that registers a handler on a router.
func (d *discoverer) recordRegistration(scope *fileScope, fn *ast.FuncDecl, bindings routerBindings, call *ast.CallExpr) {
	selector, ok := call.Fun.(*ast.SelectorExpr)
	if !ok || len(call.Args) < 2 {
		return
	}
	literal, ok := pathLiteral(call.Args[0])
	if !ok {
		return
	}
	prefix, ok := d.routerPrefix(scope, fn, bindings, selector.X)
	if !ok {
		return
	}
	last := call.Args[len(call.Args)-1]
	handler, ok := last.(*ast.SelectorExpr)
	if !ok {
		// A handler that is not a method value — a call that builds one,
		// or a function literal — is still a registered path, and is
		// enumerated with the reason it has no production declaration.
		d.appendRoute(call, selector.Sel.Name, prefix, literal, RegisteredRoute{
			Reason: "the registered handler is not a method value of this tree, so no declaration is followed from here",
		})
		return
	}
	origin := d.resolve.originOfValueExpr(scope, fn, handler.X, 0)
	if origin.Kind != OriginProduction {
		d.appendRoute(call, selector.Sel.Name, prefix, literal, RegisteredRoute{
			Reason: "the registered handler belongs to " + origin.Name + ", a type this production tree does not declare",
		})
		return
	}
	decl, _ := d.resolve.methodDecl(origin.PkgDir, origin.Name, handler.Sel.Name)
	if decl == nil {
		d.appendRoute(call, selector.Sel.Name, prefix, literal, RegisteredRoute{
			HandlerType: origin.Name,
			HandlerName: handler.Sel.Name,
			Reason:      "no single declaration of this method was found on the registered type",
		})
		return
	}
	position := positionOf(d.fset, decl)
	d.appendRoute(call, selector.Sel.Name, prefix, literal, RegisteredRoute{
		HandlerType: origin.Name,
		HandlerName: handler.Sel.Name,
		HandlerFile: position.Filename,
		HandlerLine: position.Line,
		Reason: "path is the group prefix " + strconv.Quote(prefix) + " followed by the registered path " +
			strconv.Quote(literal) + ", and the handler is the declaration of " + handler.Sel.Name +
			" on " + origin.Name,
	})
}

func (d *discoverer) appendRoute(call *ast.CallExpr, method, prefix, literal string, route RegisteredRoute) {
	position := positionOf(d.fset, call)
	route.File = position.Filename
	route.Line = position.Line
	route.Method = method
	route.GroupPrefix = prefix
	route.RegisteredPath = literal
	route.FullPath = prefix + literal
	d.routes = append(d.routes, route)
}

// routerPrefix reports the path prefix the expression carries when it is
// a router: a name already bound to a group, or a value whose type comes
// from a package outside this module, which is what a router library's
// engine is.
func (d *discoverer) routerPrefix(scope *fileScope, fn *ast.FuncDecl, bindings routerBindings, expr ast.Expr) (string, bool) {
	ident, ok := expr.(*ast.Ident)
	if !ok {
		return "", false
	}
	if prefix, ok := bindings[ident.Name]; ok {
		return prefix, true
	}
	if d.resolve.originOfValueExpr(scope, fn, ident, 0).Kind == OriginOtherPackage {
		return "", true
	}
	return "", false
}

// pathLiteral reports the content of a string literal that spells a path,
// which is the only first argument a grouping or registration call takes.
func pathLiteral(expr ast.Expr) (string, bool) {
	lit, ok := expr.(*ast.BasicLit)
	if !ok || lit.Kind != token.STRING {
		return "", false
	}
	content, err := strconv.Unquote(lit.Value)
	if err != nil || !strings.HasPrefix(content, "/") {
		return "", false
	}
	return content, true
}

// ChainStep is one declaration the chain from a route handler passes
// through, in the order the walk reached it.
type ChainStep struct {
	File string
	Line int
	Name string
}

// Position renders the step as "file:line".
func (s ChainStep) Position() string {
	return fmt.Sprintf("%s:%d", s.File, s.Line)
}

// RouteChain is the walk from a registered route's handler through the
// production declarations it calls, down to the text carrier sites those
// declarations hold.
type RouteChain struct {
	Route RegisteredRoute
	Steps []ChainStep
	Sites []TextCarrierSite
}

// RelaySites returns the chain's sites whose every text-carrying field
// comes from the request body the route bound: the relay, and nothing
// else.
func (c RouteChain) RelaySites() []TextCarrierSite {
	var out []TextCarrierSite
	for _, site := range c.Sites {
		if site.Category == CategoryEmbeddedInLocalValue || len(site.FieldOrigins) == 0 {
			continue
		}
		relay := true
		for _, origin := range site.FieldOrigins {
			if origin.Category != SourceRouteBody {
				relay = false
				break
			}
		}
		if relay {
			out = append(out, site)
		}
	}
	return out
}

const maxChainSteps = 64

// ChainFrom follows the value the route's handler binds from the request
// body — through every call that receives it, into the declaration that
// receives it, and on — and collects the text carrier sites written in
// the declarations the body reaches.
//
// Following the body rather than every callee is what makes the result
// a chain instead of a reachability set: a handler calls logging,
// validation and persistence too, and none of those is the path the
// received text takes to the wire.
func (e *Enumeration) ChainFrom(route RegisteredRoute) (RouteChain, error) {
	chain := RouteChain{Route: route}
	if route.HandlerFile == "" {
		return chain, &GuardError{
			Location: route.Position(),
			Message:  "route " + route.FullPath + " has no handler declaration to follow: " + route.Reason,
		}
	}
	decl, scope, ok := e.walk.declAt(route.HandlerFile, route.HandlerLine)
	if !ok {
		return chain, &GuardError{
			Location: route.HandlerFile + ":" + strconv.Itoa(route.HandlerLine),
			Message:  "the handler declaration of route " + route.FullPath + " could not be read back",
		}
	}
	bound := e.walk.boundRequestBodyNames(scope, decl)
	if len(bound) == 0 {
		return chain, &GuardError{
			Location: positionOf(e.walk.fset, decl).String(),
			Message: "the handler of route " + route.FullPath +
				" binds no request body value, so nothing can be followed from the body to the wire",
		}
	}

	type frame struct {
		decl    *ast.FuncDecl
		scope   *fileScope
		tainted map[string]bool
	}
	seen := map[*ast.FuncDecl]bool{decl: true}
	queue := []frame{{decl: decl, scope: scope, tainted: bound}}
	for len(queue) > 0 && len(chain.Steps) < maxChainSteps {
		current := queue[0]
		queue = queue[1:]
		position := positionOf(e.walk.fset, current.decl)
		chain.Steps = append(chain.Steps, ChainStep{
			File: position.Filename,
			Line: position.Line,
			Name: current.decl.Name.Name,
		})
		chain.Sites = append(chain.Sites, e.sitesInside(current.decl)...)

		e.walk.growTaint(current.decl, current.tainted)
		ast.Inspect(current.decl.Body, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok {
				return true
			}
			callee, calleeScope := e.walk.resolve.calleeDecl(current.scope, current.decl, call, 0)
			if callee == nil || callee.Body == nil {
				return true
			}
			passed := passedTaintedParams(call, callee, current.tainted)
			if len(passed) == 0 || seen[callee] {
				return true
			}
			seen[callee] = true
			queue = append(queue, frame{decl: callee, scope: calleeScope, tainted: passed})
			return true
		})
	}
	sort.SliceStable(chain.Sites, func(i, j int) bool {
		if chain.Sites[i].File != chain.Sites[j].File {
			return chain.Sites[i].File < chain.Sites[j].File
		}
		return chain.Sites[i].Line < chain.Sites[j].Line
	})
	return chain, nil
}

// boundRequestBodyNames finds the locals a handler binds from the
// request it received: a call on a value of an outside package — the
// router library's request context — that is handed the address of a
// local, which is how a body is decoded into that local.
func (d *discoverer) boundRequestBodyNames(scope *fileScope, fn *ast.FuncDecl) map[string]bool {
	bound := map[string]bool{}
	ast.Inspect(fn.Body, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok {
			return true
		}
		selector, ok := call.Fun.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		if d.resolve.originOfValueExpr(scope, fn, selector.X, 0).Kind != OriginOtherPackage {
			return true
		}
		for _, arg := range call.Args {
			unary, ok := arg.(*ast.UnaryExpr)
			if !ok || unary.Op != token.AND {
				continue
			}
			if name := baseIdentName(unary.X); name != "" {
				bound[name] = true
			}
		}
		return true
	})
	return bound
}

// growTaint adds the locals a function assigns from an already tainted
// value, so a body copied into another name stays followed.
func (d *discoverer) growTaint(fn *ast.FuncDecl, tainted map[string]bool) {
	for round := 0; round < maxFlowRounds; round++ {
		grew := false
		ast.Inspect(fn.Body, func(n ast.Node) bool {
			assign, ok := n.(*ast.AssignStmt)
			if !ok {
				return true
			}
			for i, rhs := range assign.Rhs {
				if !carriesTaint(rhs, tainted) {
					continue
				}
				var targets []ast.Expr
				if len(assign.Lhs) == len(assign.Rhs) {
					targets = []ast.Expr{assign.Lhs[i]}
				} else {
					targets = assign.Lhs
				}
				for _, target := range targets {
					if name := baseIdentName(target); name != "" && !tainted[name] {
						tainted[name] = true
						grew = true
					}
				}
			}
			return true
		})
		if !grew {
			return
		}
	}
}

// passedTaintedParams maps the arguments that carry the received body
// onto the parameter names of the callee, which is the set the callee
// itself starts out tainted with.
func passedTaintedParams(call *ast.CallExpr, callee *ast.FuncDecl, tainted map[string]bool) map[string]bool {
	names := parameterNamesInOrder(callee)
	passed := map[string]bool{}
	for i, arg := range call.Args {
		if i >= len(names) || names[i] == "" || !carriesTaint(arg, tainted) {
			continue
		}
		passed[names[i]] = true
	}
	return passed
}

// parameterNamesInOrder flattens a parameter list into one name per
// positional argument, so an argument index maps onto the name the
// callee reads it under.
func parameterNamesInOrder(fn *ast.FuncDecl) []string {
	var names []string
	if fn.Type.Params == nil {
		return names
	}
	for _, field := range fn.Type.Params.List {
		if len(field.Names) == 0 {
			names = append(names, "")
			continue
		}
		for _, name := range field.Names {
			names = append(names, name.Name)
		}
	}
	return names
}

// sitesInside returns the enumerated sites written between the first and
// the last line of a declaration.
func (e *Enumeration) sitesInside(decl *ast.FuncDecl) []TextCarrierSite {
	start := positionOf(e.walk.fset, decl)
	end := e.walk.fset.Position(decl.End())
	var out []TextCarrierSite
	for _, site := range e.Sites {
		if site.File == start.Filename && site.Line >= start.Line && site.Line <= end.Line {
			out = append(out, site)
		}
	}
	return out
}

// declAt finds the function declaration that starts at a given position,
// which is how a route's handler is read back after the walk recorded
// where it was declared.
func (d *discoverer) declAt(file string, line int) (*ast.FuncDecl, *fileScope, bool) {
	parsed, ok := d.files[file]
	if !ok {
		return nil, nil, false
	}
	scope := newFileScope(file, parsed)
	for _, decl := range parsed.Decls {
		fn, ok := decl.(*ast.FuncDecl)
		if !ok || fn.Body == nil {
			continue
		}
		if positionOf(d.fset, fn).Line == line {
			return fn, scope, true
		}
	}
	return nil, nil, false
}

// RouteWithPath returns the registered route whose full path is exactly
// path. A path that matches nothing, or matches more than one
// registration, fails with the paths that were computed, so a boundary
// value that stops being a route is reported instead of skipped.
func (e *Enumeration) RouteWithPath(path string) (RegisteredRoute, error) {
	var matches []RegisteredRoute
	for _, route := range e.Routes {
		if route.FullPath == path {
			matches = append(matches, route)
		}
	}
	switch len(matches) {
	case 1:
		return matches[0], nil
	case 0:
		return RegisteredRoute{}, &GuardError{
			Location: "registered routes",
			Message: "no registered route has the full path " + strconv.Quote(path) +
				"; the tree registers " + strconv.Itoa(len(e.Routes)) + " routes, computed by AST",
		}
	default:
		return RegisteredRoute{}, &GuardError{
			Location: matches[0].Position(),
			Message:  strconv.Itoa(len(matches)) + " registrations share the full path " + strconv.Quote(path),
		}
	}
}
