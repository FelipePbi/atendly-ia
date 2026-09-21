package transportguard

import (
	"go/ast"
	"sort"
	"strconv"
	"strings"
)

// maxReachedDeclarations bounds the walk a single route reach may take
// through this tree. Passing the bound is an error, never a truncation:
// a reach cut short would under-report the literals the route can carry,
// and under-reporting is the direction this guard must not take.
const maxReachedDeclarations = 512

// ReachedProseLiteral is one non-empty Go string literal that the reach
// from a registered route finds written into a text-carrying field: the
// route it was reached from, the source position of the literal, its
// content, and the carrier field it is written into.
type ReachedProseLiteral struct {
	RouteMethod string
	RoutePath   string
	File        string
	Line        int
	Content     string
	Field       string
}

// Position renders the literal as "file:line".
func (l ReachedProseLiteral) Position() string {
	return l.File + ":" + strconv.Itoa(l.Line)
}

// RouteProseReach is what one registered route can carry: the production
// declarations its handler reaches, the text carrier sites written in
// them, and the non-empty Go literals those sites put into a carrier
// field.
//
// The reach is deliberately an over-approximation, and that is what
// makes it fail-closed. It follows every production declaration the
// handler calls, not only the ones the received request body is passed
// to: which branch runs, and whether a helper is called with the body or
// with something else, are run-time facts, and this guard reads code. A
// literal that some execution would never reach is therefore reported
// from that route, and a literal the route can reach is never missed.
// ChainFrom is the narrow reading of the same walk — the body, and only
// the body — and RouteProseReach keeps its result alongside, so the two
// readings can be compared instead of one silently standing for both.
type RouteProseReach struct {
	Route RegisteredRoute
	// Declarations are the production declarations the reach walked,
	// starting at the handler of the route.
	Declarations []ChainStep
	// Sites are the text carrier sites written in those declarations.
	Sites []TextCarrierSite
	// Literals are the non-empty Go literals those sites write into a
	// carrier field, one entry per literal and field.
	Literals []ReachedProseLiteral
	// ChainSites and RelaySites are the narrow reading: the sites
	// ChainFrom reaches by following the request body the handler bound,
	// and the subset of those whose every field comes from that body.
	ChainSites []TextCarrierSite
	RelaySites []TextCarrierSite
	// ChainReason states why the narrow reading is empty when the body
	// could not be followed — a handler that binds no request body, for
	// one. It does not make the reach itself incomplete: the reach above
	// is computed without the body.
	ChainReason string
}

// RouteReachRefusal is a registered route whose reach cannot be walked
// at all, with the reason the enumeration already wrote for it. A route
// whose handler is not a declaration of this tree — a library handler, a
// static file server — has no production declaration to walk, so there
// is nothing to read and nothing to prove.
type RouteReachRefusal struct {
	Route  RegisteredRoute
	Reason string
}

// ProseReachReport holds the reach of every registered route that has a
// handler declaration, and the routes that have none.
type ProseReachReport struct {
	Reaches  []RouteProseReach
	Refusals []RouteReachRefusal
}

// ProseReachFrom walks the production declarations the handler of the
// route reaches and collects the non-empty Go literals written from them
// into a text-carrying field.
//
// A site whose value the transport never carries — the embedded-in-local
// category — is skipped here for the same reason
// GoProseLiteralsReachingTransport skips it: a literal written into a
// value that never leaves is not text a customer number receives. Every
// literal this returns is therefore a member of the set Goal042
// asserted, which is what makes the two sets crossable rather than
// merely similar.
func (e *Enumeration) ProseReachFrom(route RegisteredRoute) (RouteProseReach, error) {
	reach := RouteProseReach{Route: route}
	if route.HandlerFile == "" {
		return reach, &GuardError{
			Location: route.Position(),
			Message: "route " + route.Method + " " + route.FullPath +
				" has no handler declaration to reach from: " + route.Reason,
		}
	}
	decl, scope, ok := e.walk.declAt(route.HandlerFile, route.HandlerLine)
	if !ok {
		return reach, &GuardError{
			Location: route.HandlerFile + ":" + strconv.Itoa(route.HandlerLine),
			Message:  "the handler declaration of route " + route.FullPath + " could not be read back",
		}
	}

	type frame struct {
		decl  *ast.FuncDecl
		scope *fileScope
	}
	seen := map[*ast.FuncDecl]bool{decl: true}
	queue := []frame{{decl: decl, scope: scope}}
	for len(queue) > 0 {
		if len(reach.Declarations) >= maxReachedDeclarations {
			return reach, &GuardError{
				Location: route.Position(),
				Message: "the reach from route " + route.Method + " " + route.FullPath + " passed through " +
					strconv.Itoa(maxReachedDeclarations) + " declarations without ending; it is refused rather " +
					"than truncated, because a truncated reach would under-report the literals the route carries",
			}
		}
		current := queue[0]
		queue = queue[1:]
		position := positionOf(e.walk.fset, current.decl)
		reach.Declarations = append(reach.Declarations, ChainStep{
			File: position.Filename,
			Line: position.Line,
			Name: current.decl.Name.Name,
		})
		reach.Sites = append(reach.Sites, e.sitesInside(current.decl)...)

		ast.Inspect(current.decl.Body, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok {
				return true
			}
			callee, calleeScope := e.walk.resolve.calleeDecl(current.scope, current.decl, call, 0)
			if callee == nil || callee.Body == nil || seen[callee] {
				return true
			}
			seen[callee] = true
			queue = append(queue, frame{decl: callee, scope: calleeScope})
			return true
		})
	}
	sortSitesByPosition(reach.Sites)

	for _, site := range reach.Sites {
		if site.Category == CategoryEmbeddedInLocalValue {
			continue
		}
		for _, origin := range site.FieldOrigins {
			for _, literal := range collectGoLiterals(origin) {
				reach.Literals = append(reach.Literals, ReachedProseLiteral{
					RouteMethod: route.Method,
					RoutePath:   route.FullPath,
					File:        literal.File,
					Line:        literal.Line,
					Content:     literalContentOf(literal.Reason),
					Field:       origin.FieldName,
				})
			}
		}
	}
	reach.Literals = dedupeReachedLiterals(reach.Literals)

	// The narrow reading is kept beside the wide one, never in place of
	// it: a route whose handler binds no request body still has a reach.
	chain, err := e.ChainFrom(route)
	if err != nil {
		reach.ChainReason = err.Error()
		return reach, nil
	}
	reach.ChainSites = chain.Sites
	reach.RelaySites = chain.RelaySites()
	return reach, nil
}

// ProseReachOfRoutes computes the reach of each route given. A route
// whose handler is not a declaration of this tree — a library handler, a
// static file server, a closure written at the registration call rather
// than a method of this tree — is counted as a refusal with the reason
// the enumeration already wrote for it, exactly as
// ProseReachOfEveryRegisteredRoute counts it: there is no production
// declaration to walk, so there is nothing to read and nothing to prove,
// and refusing the walk is not the same as failing it.
//
// It stays fail-closed where it matters: a route that has a handler
// declaration and still cannot be walked fails, instead of quietly
// dropping out of the set that is claimed to be reached.
func (e *Enumeration) ProseReachOfRoutes(routes []RegisteredRoute) (ProseReachReport, error) {
	var report ProseReachReport
	for _, route := range routes {
		reach, err := e.ProseReachFrom(route)
		if err != nil {
			if route.HandlerFile == "" {
				report.Refusals = append(report.Refusals, RouteReachRefusal{Route: route, Reason: route.Reason})
				continue
			}
			return report, err
		}
		report.Reaches = append(report.Reaches, reach)
	}
	return report, nil
}

// ProseReachOfEveryRegisteredRoute is the same walk over every route this
// tree registers.
func (e *Enumeration) ProseReachOfEveryRegisteredRoute() (ProseReachReport, error) {
	return e.ProseReachOfRoutes(e.Routes)
}

// RoutesReachingLiteralAt returns the routes whose reach finds the
// literal written at this exact source position, computed from the
// reaches rather than looked up in a written list.
func (r ProseReachReport) RoutesReachingLiteralAt(file string, line int) []RegisteredRoute {
	var out []RegisteredRoute
	for _, reach := range r.Reaches {
		for _, literal := range reach.Literals {
			if literal.File == file && literal.Line == line {
				out = append(out, reach.Route)
				break
			}
		}
	}
	return out
}

// Literals flattens every literal of every reach in the report, in the
// order the reaches were computed.
func (r ProseReachReport) Literals() []ReachedProseLiteral {
	var out []ReachedProseLiteral
	for _, reach := range r.Reaches {
		out = append(out, reach.Literals...)
	}
	return out
}

// Report renders the routes whose reach finds at least one literal, with
// the literals under each.
func (r ProseReachReport) Report() string {
	var b strings.Builder
	for _, reach := range r.Reaches {
		if len(reach.Literals) == 0 {
			continue
		}
		b.WriteString(reach.Route.Method + " " + reach.Route.FullPath + " reaches " +
			strconv.Itoa(len(reach.Literals)) + " literals through " +
			strconv.Itoa(len(reach.Declarations)) + " declarations\n")
		for _, literal := range reach.Literals {
			b.WriteString("  " + literal.Position() + " writes " + strconv.Quote(literal.Content) +
				" into " + literal.Field + "\n")
		}
	}
	b.WriteString("routes with no handler declaration to reach from: " + strconv.Itoa(len(r.Refusals)) + "\n")
	return b.String()
}

// dedupeReachedLiterals collapses the same literal reached through more
// than one site of the same route into one entry per field, and orders
// the result by position and field so the set reads the same on every
// run.
func dedupeReachedLiterals(literals []ReachedProseLiteral) []ReachedProseLiteral {
	type key struct {
		file  string
		line  int
		field string
	}
	seen := map[key]bool{}
	out := make([]ReachedProseLiteral, 0, len(literals))
	for _, literal := range literals {
		id := key{file: literal.File, line: literal.Line, field: literal.Field}
		if seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, literal)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].File != out[j].File {
			return out[i].File < out[j].File
		}
		if out[i].Line != out[j].Line {
			return out[i].Line < out[j].Line
		}
		return out[i].Field < out[j].Field
	})
	return out
}

// sortSitesByPosition orders sites by file and line, the order every
// other set in this guard is read in.
func sortSitesByPosition(sites []TextCarrierSite) {
	sort.SliceStable(sites, func(i, j int) bool {
		if sites[i].File != sites[j].File {
			return sites[i].File < sites[j].File
		}
		return sites[i].Line < sites[j].Line
	})
}
