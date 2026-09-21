package transportguard

import (
	"errors"
	"fmt"
	"go/ast"
	"go/token"
	"path/filepath"
	"sort"
	"strings"
)

// SiteCategory names how a value reaches the wire. The two send-call
// categories are deliberately distinct: a call to the service's own
// forwarding method is not the same event as a call to the transport
// library client that owns the socket, and the enumeration has to say
// which of the two a site is.
type SiteCategory string

const (
	// CategoryInternalWrapperSend is a call to a method declared in this
	// production tree that forwards the message on to the transport
	// library. It is recognized by that forwarding, not by its name.
	CategoryInternalWrapperSend SiteCategory = "send_via_internal_wrapper"
	// CategoryTransportClientSend is a call whose receiver resolves to a
	// type of the transport library package — the last hop under this
	// repository's control.
	CategoryTransportClientSend SiteCategory = "send_via_transport_client"
	// CategoryTransportBuilder is a call to a transport library method
	// that takes a proto message and gives back another proto message: it
	// composes a payload, it does not transmit one. A revoke, an edit and
	// a history sync request are built this way, and each has to be named
	// as composition instead of falling through as residue.
	CategoryTransportBuilder SiteCategory = "composed_by_transport_builder"
	// CategoryEmbeddedInLocalValue is a carrier literal written inside a
	// value whose type is not a proto message. The transport only accepts
	// proto messages, so such a value is not what goes on the wire — it is
	// a result the service reports back to its own caller. The category
	// names that outcome instead of leaving the literal as residue.
	CategoryEmbeddedInLocalValue SiteCategory = "embedded_in_non_transport_value"
)

// Composition says whether a carrier literal is itself the value handed
// to the send call, or is written inside the value that is.
type Composition string

const (
	// CompositionStandalone is a literal that is the transported value.
	CompositionStandalone Composition = "carrier_literal_is_the_transported_value"
	// CompositionNested is a literal written inside the transported value,
	// which therefore reaches the wire on that value's route.
	CompositionNested Composition = "carrier_literal_nested_in_transported_value"
)

// PayloadProvenance names where the message value a send call transports
// was composed. A site whose payload is a literal written here and a site
// whose payload the transport library built (a revoke, an edit, a history
// sync request) are different events, and neither may fall through as
// residue.
type PayloadProvenance string

const (
	// ProvenanceCarrierLiteral is a payload composed in this tree as a
	// proto message composite literal.
	ProvenanceCarrierLiteral PayloadProvenance = "payload_composed_as_carrier_literal"
	// ProvenanceTransportBuilder is a payload returned by a transport
	// library method, so its text never passes through a literal here.
	ProvenanceTransportBuilder PayloadProvenance = "payload_built_by_transport_library"
	// ProvenanceForwardedParameter is a payload this function received as
	// a proto message parameter and passes on unchanged.
	ProvenanceForwardedParameter PayloadProvenance = "payload_forwarded_from_message_parameter"
)

// TextCarrierSite is one proto message composite literal that writes at
// least one text-carrying field, together with the send call that puts it
// on the wire.
type TextCarrierSite struct {
	File          string
	Line          int
	MessageType   string
	CarrierFields []string
	// FieldOrigins classifies where the value of each entry of
	// CarrierFields came from, in the same order. Every write in
	// CarrierFields has exactly one entry here — no implicit category.
	FieldOrigins []FieldOrigin
	Category     SiteCategory
	Composition  Composition
	// Reason states, in the enumeration itself, why the site landed in
	// its category, so the classification is auditable without rereading
	// the classifier.
	Reason string
	// SendFile and SendLine locate the call that carries the value holding
	// this literal out to the transport.
	SendFile string
	SendLine int
}

// Position renders the site as the "file:line" form used everywhere in
// this guard's output and failures.
func (s TextCarrierSite) Position() string {
	return fmt.Sprintf("%s:%d", s.File, s.Line)
}

// TransportCall is one call that carries a proto message value out of the
// function that holds it.
type TransportCall struct {
	File        string
	Line        int
	Category    SiteCategory
	Provenance  PayloadProvenance
	MessageType string
	Reason      string
}

// Position renders the call as "file:line".
func (c TransportCall) Position() string {
	return fmt.Sprintf("%s:%d", c.File, c.Line)
}

// Enumeration is the whole result of reading the production tree: the
// derived carrier fields, every carrier literal with its route, and every
// call that transports a proto message value.
type Enumeration struct {
	Paths         TransportPackagePaths
	CarrierFields []CarrierField
	Sites         []TextCarrierSite
	Calls         []TransportCall
	// Routes holds every HTTP route the tree registers, with the full
	// path assembled from the group prefix and the registered path.
	Routes []RegisteredRoute
	// walk keeps the parsed tree the enumeration was produced from, so a
	// question asked afterwards — which declarations a route handler
	// reaches — is answered against the same syntax trees and the same
	// positions rather than by parsing again.
	walk *discoverer
}

// Enumerate reads the evolution-go production tree under evolutionGoRoot
// and enumerates every site that puts text on the wire toward a WhatsApp
// number. Recognition is by shape only. A carrier literal whose route to
// a send call cannot be resolved is an error naming its "file:line",
// never a silently skipped site.
func Enumerate(evolutionGoRoot string) (*Enumeration, error) {
	paths, err := DeriveTransportPackagePaths(evolutionGoRoot)
	if err != nil {
		return nil, err
	}
	carrierFields, err := DeriveCarrierFields(CarrierProtoFilePath(evolutionGoRoot))
	if err != nil {
		return nil, err
	}
	productionPaths, err := discoverAnalysedFiles(evolutionGoRoot)
	if err != nil {
		return nil, err
	}
	fset, files, err := parseProductionFiles(productionPaths)
	if err != nil {
		return nil, err
	}
	library, err := buildLibraryIndex(fset, evolutionGoRoot)
	if err != nil {
		return nil, err
	}
	protoStructs, err := buildProtoIndex(fset, evolutionGoRoot)
	if err != nil {
		return nil, err
	}
	modulePath, err := ModuleImportPath(evolutionGoRoot)
	if err != nil {
		return nil, err
	}
	moduleRoot, err := filepath.Abs(evolutionGoRoot)
	if err != nil {
		return nil, err
	}

	disc := &discoverer{
		fset:     fset,
		files:    files,
		order:    productionPaths,
		carriers: indexCarrierFields(carrierFields),
		resolve: &resolver{
			index:      buildTypeIndex(files),
			library:    library,
			proto:      protoStructs,
			paths:      paths,
			modulePath: modulePath,
			moduleRoot: moduleRoot,
		},
		forwarders: map[*ast.FuncDecl]forwarderState{},
	}
	if err := disc.run(); err != nil {
		return nil, err
	}

	return &Enumeration{
		Paths:         paths,
		CarrierFields: carrierFields,
		Sites:         disc.sites,
		Calls:         disc.calls,
		Routes:        disc.routes,
		walk:          disc,
	}, nil
}

// carrierIndex maps a proto message type to the set of its text-carrying
// field names, as derived in DeriveCarrierFields.
type carrierIndex map[string]map[string]bool

func indexCarrierFields(fields []CarrierField) carrierIndex {
	index := carrierIndex{}
	for _, field := range fields {
		if index[field.MessageType] == nil {
			index[field.MessageType] = map[string]bool{}
		}
		index[field.MessageType][field.FieldName] = true
	}
	return index
}

type forwarderState int

const (
	forwarderUnknown forwarderState = iota
	forwarderInProgress
	forwarderYes
	forwarderNo
)

type discoverer struct {
	fset     *token.FileSet
	files    map[string]*ast.File
	order    []string
	carriers carrierIndex
	resolve  *resolver

	sites []TextCarrierSite
	calls []TransportCall

	forwarders map[*ast.FuncDecl]forwarderState
	seenCalls  map[string]bool

	// routes holds every HTTP route registration found in the tree.
	routes []RegisteredRoute

	// residue holds every shape the guard could not account for. It is
	// collected instead of returned at the first hit so one run names
	// every offending "file:line", and run() joins it into the single
	// error Enumerate refuses with.
	residue []error
}

func (d *discoverer) run() error {
	d.seenCalls = map[string]bool{}
	for _, path := range d.order {
		if err := d.walkFile(path, d.files[path]); err != nil {
			return err
		}
	}
	sort.SliceStable(d.sites, func(i, j int) bool {
		if d.sites[i].File != d.sites[j].File {
			return d.sites[i].File < d.sites[j].File
		}
		return d.sites[i].Line < d.sites[j].Line
	})
	d.discoverRegisteredRoutes()
	sort.SliceStable(d.calls, func(i, j int) bool {
		if d.calls[i].File != d.calls[j].File {
			return d.calls[i].File < d.calls[j].File
		}
		return d.calls[i].Line < d.calls[j].Line
	})
	return errors.Join(d.residue...)
}

func (d *discoverer) walkFile(path string, file *ast.File) error {
	scope := newFileScope(path, file)
	protoAlias, imported := importAlias(file, d.resolve.paths.Proto)
	_, libraryImported := importAlias(file, d.resolve.paths.Library)

	for _, decl := range file.Decls {
		funcDecl, ok := decl.(*ast.FuncDecl)
		if !ok || funcDecl.Body == nil {
			continue
		}
		if imported {
			if err := d.walkCarrierLiterals(scope, funcDecl, protoAlias); err != nil {
				return err
			}
		}
		if libraryImported || imported {
			if err := d.walkTransportCalls(scope, funcDecl); err != nil {
				return err
			}
		}
	}

	// A proto message composite literal outside any function body would
	// escape the per-function flow analysis, so it is refused instead of
	// being skipped.
	if imported {
		if err := d.refuseTopLevelCarrierLiterals(path, file, protoAlias); err != nil {
			return err
		}
	}
	return nil
}

// refuseTopLevelCarrierLiterals fails on a carrier literal declared
// outside a function body, whose route to a send call this guard cannot
// follow.
func (d *discoverer) refuseTopLevelCarrierLiterals(path string, file *ast.File, protoAlias string) error {
	var failure error
	for _, decl := range file.Decls {
		genDecl, ok := decl.(*ast.GenDecl)
		if !ok {
			continue
		}
		ast.Inspect(genDecl, func(n ast.Node) bool {
			if failure != nil {
				return false
			}
			lit, ok := n.(*ast.CompositeLit)
			if !ok {
				return true
			}
			msgType, ok := protoLiteralType(lit, protoAlias)
			if !ok || len(d.writtenCarrierFields(msgType, lit)) == 0 {
				return true
			}
			failure = &GuardError{
				Location: positionOf(d.fset, lit).String(),
				Message: "proto message literal of type " + msgType +
					" writes a text-carrying field outside any function body; its route to a send call cannot be followed",
			}
			return false
		})
	}
	return failure
}

// protoLiteralType reports the proto message type name of lit when lit is
// a composite literal of the proto package, using the local import alias
// of the file being read rather than any written package name.
func protoLiteralType(lit *ast.CompositeLit, protoAlias string) (string, bool) {
	selector, ok := lit.Type.(*ast.SelectorExpr)
	if !ok {
		return "", false
	}
	pkgIdent, ok := selector.X.(*ast.Ident)
	if !ok || pkgIdent.Name != protoAlias {
		return "", false
	}
	return selector.Sel.Name, true
}

// carrierFieldWrite pairs a written carrier field name with the value
// expression assigned to it, so the value's origin can be classified.
type carrierFieldWrite struct {
	Name  string
	Value ast.Expr
}

// writtenCarrierFieldWrites returns the text-carrying fields this literal
// actually writes, together with each field's value expression, in source
// order.
func (d *discoverer) writtenCarrierFieldWrites(msgType string, lit *ast.CompositeLit) []carrierFieldWrite {
	carriers := d.carriers[msgType]
	if len(carriers) == 0 {
		return nil
	}
	var written []carrierFieldWrite
	for _, elt := range lit.Elts {
		keyValue, ok := elt.(*ast.KeyValueExpr)
		if !ok {
			continue
		}
		key, ok := keyValue.Key.(*ast.Ident)
		if ok && carriers[key.Name] {
			written = append(written, carrierFieldWrite{Name: key.Name, Value: keyValue.Value})
		}
	}
	return written
}

// writtenCarrierFields returns the text-carrying fields this literal
// actually writes, in source order.
func (d *discoverer) writtenCarrierFields(msgType string, lit *ast.CompositeLit) []string {
	writes := d.writtenCarrierFieldWrites(msgType, lit)
	if len(writes) == 0 {
		return nil
	}
	names := make([]string, len(writes))
	for i, w := range writes {
		names[i] = w.Name
	}
	return names
}

func (d *discoverer) walkCarrierLiterals(scope *fileScope, fn *ast.FuncDecl, protoAlias string) error {
	parents := parentMap(fn)

	var literals []*ast.CompositeLit
	ast.Inspect(fn.Body, func(n ast.Node) bool {
		lit, ok := n.(*ast.CompositeLit)
		if !ok {
			return true
		}
		msgType, ok := protoLiteralType(lit, protoAlias)
		if ok && len(d.writtenCarrierFields(msgType, lit)) > 0 {
			literals = append(literals, lit)
		}
		return true
	})

	for _, lit := range literals {
		msgType, _ := protoLiteralType(lit, protoAlias)
		writes := d.writtenCarrierFieldWrites(msgType, lit)
		fields := make([]string, len(writes))
		fieldOrigins := make([]FieldOrigin, len(writes))
		unresolved := false
		for i, write := range writes {
			fields[i] = write.Name
			origin, err := d.classifyFieldOrigin(scope, fn, write.Name, write.Value)
			if err != nil {
				// Residue is collected rather than returned at once, so
				// one run names every shape the guard cannot account for
				// instead of only the first. It is still fail-closed: the
				// collected errors are joined and returned by run().
				d.residue = append(d.residue, err)
				unresolved = true
				continue
			}
			fieldOrigins[i] = origin
		}
		if unresolved {
			continue
		}
		position := positionOf(d.fset, lit)

		root, embeddedIn := d.carrierRoot(scope, lit, parents)

		composition := CompositionStandalone
		nesting := ""
		if enclosing, nested := enclosingCompositeLit(lit, parents); nested {
			composition = CompositionNested
			nesting = "; written inside the composite literal at " + positionOf(d.fset, enclosing).String()
		}

		if embeddedIn != nil {
			enclosingType := d.resolve.originOfTypeExpr(scope, embeddedIn.Type)
			d.sites = append(d.sites, TextCarrierSite{
				File:          position.Filename,
				Line:          position.Line,
				MessageType:   msgType,
				CarrierFields: fields,
				FieldOrigins:  fieldOrigins,
				Category:      CategoryEmbeddedInLocalValue,
				Composition:   CompositionNested,
				Reason: "literal is written inside the composite literal at " +
					positionOf(d.fset, embeddedIn).String() + ", whose type " + enclosingType.Name +
					" is not a proto message, so the transport never carries this value",
			})
			continue
		}

		send, category, reason, err := d.routeOfRoot(scope, fn, parents, root, msgType)
		if err != nil {
			d.residue = append(d.residue, err)
			continue
		}
		sendPosition := positionOf(d.fset, send)
		d.sites = append(d.sites, TextCarrierSite{
			File:          position.Filename,
			Line:          position.Line,
			MessageType:   msgType,
			CarrierFields: fields,
			FieldOrigins:  fieldOrigins,
			Category:      category,
			Composition:   composition,
			Reason:        reason + nesting,
			SendFile:      sendPosition.Filename,
			SendLine:      sendPosition.Line,
		})
	}
	return nil
}

// carrierRoot climbs from a carrier literal to the outermost proto
// message value it is part of: through the address-of operator, through a
// struct field key, through an enclosing proto composite literal and
// through the append builtin, all of which carry the literal along
// unchanged. It stops at a composite literal whose type is not a proto
// message and returns it as embeddedIn, because the transport accepts
// proto messages only and such a value never reaches the wire.
func (d *discoverer) carrierRoot(
	scope *fileScope,
	lit *ast.CompositeLit,
	parents map[ast.Node]ast.Node,
) (root ast.Node, embeddedIn *ast.CompositeLit) {
	cursor := ast.Node(lit)
	value := ast.Node(lit)
	for {
		parent, ok := parents[cursor]
		if !ok {
			return value, nil
		}
		switch p := parent.(type) {
		case *ast.UnaryExpr:
			if p.Op != token.AND {
				return value, nil
			}
			value = p
		case *ast.ParenExpr:
			value = p
		case *ast.KeyValueExpr:
			// A field key carries its value onward unchanged; the value
			// node stays what it was.
		case *ast.CompositeLit:
			if d.resolve.originOfTypeExpr(scope, p.Type).Kind != OriginProto {
				return value, p
			}
			value = p
		case *ast.CallExpr:
			// append is the only builtin that gives back the contents it
			// was handed; every other call is a consumer, not a wrapper.
			ident, isBuiltin := p.Fun.(*ast.Ident)
			if !isBuiltin || ident.Name != "append" {
				return value, nil
			}
			value = p
		default:
			return value, nil
		}
		cursor = parent
	}
}

// routeOfRoot follows the root value to the call that carries it out of
// fn, and classifies that call. A value handed to a transport builder is
// followed on through the value that builder returns. An unresolvable
// route is an error naming the offending "file:line".
func (d *discoverer) routeOfRoot(
	scope *fileScope,
	fn *ast.FuncDecl,
	parents map[ast.Node]ast.Node,
	root ast.Node,
	msgType string,
) (*ast.CallExpr, SiteCategory, string, error) {
	for hop := 0; hop < maxBuilderHops; hop++ {
		position := positionOf(d.fset, root)

		anchor, ok := parents[root]
		if !ok {
			return nil, "", "", &GuardError{
				Location: position.String(),
				Message:  "proto message value of type " + msgType + " has no enclosing statement",
			}
		}

		var seeds []string
		switch a := anchor.(type) {
		case *ast.CallExpr:
			call, category, reason, ok := d.classifyTransportCall(scope, fn, a)
			if !ok {
				return nil, "", "", &GuardError{
					Location: positionOf(d.fset, a).String(),
					Message: "proto message value of type " + msgType +
						" is passed to a call that is neither a transport client method nor a method that forwards to one",
				}
			}
			if category == CategoryTransportBuilder {
				// The builder gives back another message; the route
				// continues on the value it returned.
				root = call
				continue
			}
			d.recordCall(scope, fn, call, category, ProvenanceCarrierLiteral, msgType, reason)
			return call, category, reason, nil
		case *ast.AssignStmt:
			seeds = assignedRootNames(a, root)
		default:
			return nil, "", "", &GuardError{
				Location: position.String(),
				Message: "proto message value of type " + msgType +
					" is anchored in an unrecognized statement shape " + fmt.Sprintf("%T", anchor),
			}
		}
		if len(seeds) == 0 {
			return nil, "", "", &GuardError{
				Location: position.String(),
				Message:  "proto message value of type " + msgType + " is assigned to a target with no resolvable base name",
			}
		}

		call, category, reason, ok := d.followToSend(scope, fn, seeds)
		if !ok {
			return nil, "", "", &GuardError{
				Location: position.String(),
				Message: "proto message value of type " + msgType + " is bound to " + strings.Join(seeds, ", ") +
					" but no call in the enclosing function carries that value to the transport",
			}
		}
		d.recordCall(scope, fn, call, category, ProvenanceCarrierLiteral, msgType, reason)
		return call, category, reason, nil
	}
	return nil, "", "", &GuardError{
		Location: positionOf(d.fset, root).String(),
		Message:  "proto message value of type " + msgType + " passes through more than one chain of transport builders",
	}
}

const maxBuilderHops = 8

// assignedRootNames returns the base identifier names of the assignment
// targets that receive root: "msg" for "msg", for "msg.Field" and for
// "msg[i]" alike, because writing through any of those makes the whole
// value carry the literal.
func assignedRootNames(assign *ast.AssignStmt, root ast.Node) []string {
	index := -1
	for i, rhs := range assign.Rhs {
		if containsNode(rhs, root) {
			index = i
			break
		}
	}
	var targets []ast.Expr
	switch {
	case index >= 0 && len(assign.Lhs) == len(assign.Rhs):
		targets = []ast.Expr{assign.Lhs[index]}
	default:
		targets = assign.Lhs
	}
	var names []string
	for _, target := range targets {
		if name := baseIdentName(target); name != "" {
			names = append(names, name)
		}
	}
	return names
}

func baseIdentName(expr ast.Expr) string {
	switch e := expr.(type) {
	case *ast.Ident:
		if e.Name == "_" {
			return ""
		}
		return e.Name
	case *ast.SelectorExpr:
		return baseIdentName(e.X)
	case *ast.IndexExpr:
		return baseIdentName(e.X)
	case *ast.StarExpr:
		return baseIdentName(e.X)
	case *ast.ParenExpr:
		return baseIdentName(e.X)
	}
	return ""
}

func containsNode(root ast.Node, target ast.Node) bool {
	found := false
	ast.Inspect(root, func(n ast.Node) bool {
		if found {
			return false
		}
		if n == target {
			found = true
			return false
		}
		return true
	})
	return found
}

// followToSend propagates the seed names through the assignments of fn
// and returns the first call that carries one of them to the transport.
func (d *discoverer) followToSend(scope *fileScope, fn *ast.FuncDecl, seeds []string) (*ast.CallExpr, SiteCategory, string, bool) {
	tainted := map[string]bool{}
	for _, seed := range seeds {
		tainted[seed] = true
	}
	d.expandProtoAliases(scope, fn, tainted)

	for round := 0; round < maxFlowRounds; round++ {
		grew := false
		var found *ast.CallExpr
		var foundCategory SiteCategory
		var foundReason string

		ast.Inspect(fn.Body, func(n ast.Node) bool {
			switch node := n.(type) {
			case *ast.AssignStmt:
				for i, rhs := range node.Rhs {
					if !carriesTaint(rhs, tainted) {
						continue
					}
					var targets []ast.Expr
					if len(node.Lhs) == len(node.Rhs) {
						targets = []ast.Expr{node.Lhs[i]}
					} else {
						targets = node.Lhs
					}
					for _, target := range targets {
						if name := baseIdentName(target); name != "" && !tainted[name] {
							tainted[name] = true
							grew = true
						}
					}
				}
			case *ast.CallExpr:
				if found != nil {
					return false
				}
				carries := false
				for _, arg := range node.Args {
					if carriesTaint(arg, tainted) {
						carries = true
						break
					}
				}
				if !carries {
					return true
				}
				call, category, reason, ok := d.classifyTransportCall(scope, fn, node)
				if ok && category != CategoryTransportBuilder {
					found, foundCategory, foundReason = call, category, reason
					return false
				}
			}
			return true
		})

		if found != nil {
			return found, foundCategory, foundReason, true
		}
		if !grew {
			break
		}
	}
	return nil, "", "", false
}

const maxFlowRounds = 8

// carriesTaint reports whether expr still holds one of the tainted
// values. It does not look inside a call, because a call's result is a
// new value — except append, which returns the slice it was given.
func carriesTaint(expr ast.Expr, tainted map[string]bool) bool {
	found := false
	var visit func(ast.Node) bool
	visit = func(n ast.Node) bool {
		if found || n == nil {
			return false
		}
		if call, ok := n.(*ast.CallExpr); ok {
			ident, isBuiltin := call.Fun.(*ast.Ident)
			if !isBuiltin || ident.Name != "append" {
				return false
			}
			for _, arg := range call.Args {
				ast.Inspect(arg, visit)
			}
			return false
		}
		if ident, ok := n.(*ast.Ident); ok && tainted[ident.Name] {
			found = true
			return false
		}
		return true
	}
	ast.Inspect(expr, visit)
	return found
}

// classifyTransportCall decides whether call hands its argument to the
// transport, and in which named category. A transport library method that
// returns another proto message composes rather than transmits, and is
// named as a builder so that a revoke, an edit or a history sync request
// is classified instead of becoming residue.
func (d *discoverer) classifyTransportCall(scope *fileScope, fn *ast.FuncDecl, call *ast.CallExpr) (*ast.CallExpr, SiteCategory, string, bool) {
	if selector, ok := call.Fun.(*ast.SelectorExpr); ok {
		receiver := d.resolve.originOfValueExpr(scope, fn, selector.X, 0)
		if receiver.Kind == OriginTransportLibrary {
			decl, declScope := d.resolve.calleeDecl(scope, fn, call, 0)
			if decl == nil {
				return nil, "", "", false
			}
			where := "receiver resolves to type " + receiver.Name + " of the transport library package " +
				d.resolve.paths.Library + ", and its declaration at " + positionOf(d.fset, decl).String()
			if firstResultIsProtoMessage(d.resolve, declScope, decl) {
				return call, CategoryTransportBuilder,
					where + " gives back another proto message, so the call composes a payload instead of transmitting one", true
			}
			if !declaresProtoMessageParameter(d.resolve, declScope, decl) {
				// The library method takes no proto message of its own, so
				// it does not hand a composed message to the socket. A media
				// download, an upload and a presence update all look like
				// this, and none of them carries composed text outward.
				return nil, "", "", false
			}
			return call, CategoryTransportClientSend,
				where + " takes a proto message and gives none back, so the call transmits it over the connection this library owns", true
		}
	}
	decl, declScope := d.resolve.calleeDecl(scope, fn, call, 0)
	if decl == nil {
		return nil, "", "", false
	}
	if !d.isForwarder(declScope, decl) {
		return nil, "", "", false
	}
	return call, CategoryInternalWrapperSend,
		"callee " + decl.Name.Name + " is declared at " + positionOf(d.fset, decl).String() +
			" and forwards its proto message parameter to a transport client call", true
}

// firstResultIsProtoMessage reports whether the callee's first result is
// a type of the proto message package, read from its own declaration.
func firstResultIsProtoMessage(resolve *resolver, scope *fileScope, decl *ast.FuncDecl) bool {
	if decl.Type.Results == nil || len(decl.Type.Results.List) == 0 {
		return false
	}
	return resolve.originOfTypeExpr(scope, decl.Type.Results.List[0].Type).Kind == OriginProto
}

// declaresProtoMessageParameter reports whether the callee declares a
// parameter whose type is a concrete proto message. That is what tells a
// method that transmits a composed message from one that merely takes an
// interface or raw bytes.
func declaresProtoMessageParameter(resolve *resolver, scope *fileScope, decl *ast.FuncDecl) bool {
	if decl.Type.Params == nil {
		return false
	}
	for _, field := range decl.Type.Params.List {
		if resolve.originOfTypeExpr(scope, field.Type).Kind == OriginProto {
			return true
		}
	}
	return false
}

// isForwarder reports whether decl takes a proto message parameter and
// passes that parameter to the transport client, directly or through
// another forwarder. That property — not the name of the method — is what
// makes a call an internal wrapper send.
func (d *discoverer) isForwarder(scope *fileScope, decl *ast.FuncDecl) bool {
	switch d.forwarders[decl] {
	case forwarderYes:
		return true
	case forwarderNo, forwarderInProgress:
		return false
	}
	if decl.Body == nil {
		d.forwarders[decl] = forwarderNo
		return false
	}
	d.forwarders[decl] = forwarderInProgress

	var seeds []string
	for _, field := range decl.Type.Params.List {
		if d.resolve.originOfTypeExpr(scope, field.Type).Kind != OriginProto {
			continue
		}
		for _, name := range field.Names {
			if name.Name != "_" {
				seeds = append(seeds, name.Name)
			}
		}
	}
	if len(seeds) == 0 {
		d.forwarders[decl] = forwarderNo
		return false
	}

	if _, _, _, ok := d.followToSend(scope, decl, seeds); ok {
		d.forwarders[decl] = forwarderYes
		return true
	}
	d.forwarders[decl] = forwarderNo
	return false
}

// walkTransportCalls enumerates the calls that hand a proto message value
// to the transport even when no composite literal was written in this
// function: a message the transport library itself built, and a message
// this function received as a parameter and forwards on.
func (d *discoverer) walkTransportCalls(scope *fileScope, fn *ast.FuncDecl) error {
	ast.Inspect(fn.Body, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok {
			return true
		}
		sendCall, category, reason, ok := d.classifyTransportCall(scope, fn, call)
		if !ok || category == CategoryTransportBuilder {
			return true
		}
		for _, arg := range call.Args {
			origin := d.resolve.originOfValueExpr(scope, fn, arg, 0)
			if origin.Kind != OriginProto {
				continue
			}
			provenance := ProvenanceTransportBuilder
			if isParameterName(fn, arg) {
				provenance = ProvenanceForwardedParameter
			}
			d.recordCall(scope, fn, sendCall, category, provenance, origin.Name, reason)
			break
		}
		return true
	})
	return nil
}

func isParameterName(fn *ast.FuncDecl, arg ast.Expr) bool {
	ident, ok := arg.(*ast.Ident)
	if !ok || fn.Type.Params == nil {
		return false
	}
	for _, field := range fn.Type.Params.List {
		for _, name := range field.Names {
			if name.Name == ident.Name {
				return true
			}
		}
	}
	return false
}

// recordCall adds a transport call once. A call reached from several
// literals is one site on the wire, and the first provenance that reached
// it is the one kept.
func (d *discoverer) recordCall(
	scope *fileScope,
	fn *ast.FuncDecl,
	call *ast.CallExpr,
	category SiteCategory,
	provenance PayloadProvenance,
	fallbackType string,
	reason string,
) {
	position := positionOf(d.fset, call)
	key := position.String()
	if d.seenCalls[key] {
		return
	}
	d.seenCalls[key] = true
	msgType := fallbackType
	if resolved, ok := d.transportedMessageType(scope, fn, call); ok {
		msgType = resolved
	}
	d.calls = append(d.calls, TransportCall{
		File:        position.Filename,
		Line:        position.Line,
		Category:    category,
		Provenance:  provenance,
		MessageType: msgType,
		Reason:      reason,
	})
}

// transportedMessageType names the proto message type of the argument the
// call carries, resolved from the declaration of whatever produced it.
func (d *discoverer) transportedMessageType(scope *fileScope, fn *ast.FuncDecl, call *ast.CallExpr) (string, bool) {
	for _, arg := range call.Args {
		origin := d.resolve.originOfValueExpr(scope, fn, arg, 0)
		if origin.Kind == OriginProto {
			return origin.Name, true
		}
	}
	return "", false
}

// parentMap records the parent of every node under fn, which is how a
// literal is climbed back to the value it is part of.
func parentMap(fn *ast.FuncDecl) map[ast.Node]ast.Node {
	parents := map[ast.Node]ast.Node{}
	var stack []ast.Node
	ast.Inspect(fn, func(n ast.Node) bool {
		if n == nil {
			stack = stack[:len(stack)-1]
			return true
		}
		if len(stack) > 0 {
			parents[n] = stack[len(stack)-1]
		}
		stack = append(stack, n)
		return true
	})
	return parents
}

// enclosingCompositeLit returns the nearest composite literal that lit is
// written inside of, climbing only through the constructs that keep a
// value in place: the address-of operator, a struct field key and
// parentheses.
func enclosingCompositeLit(lit *ast.CompositeLit, parents map[ast.Node]ast.Node) (ast.Node, bool) {
	var current ast.Node = lit
	for {
		parent, ok := parents[current]
		if !ok {
			return nil, false
		}
		switch p := parent.(type) {
		case *ast.CompositeLit:
			return p, true
		case *ast.UnaryExpr:
			if p.Op != token.AND {
				return nil, false
			}
		case *ast.KeyValueExpr, *ast.ParenExpr:
		default:
			return nil, false
		}
		current = parent
	}
}

// expandProtoAliases taints the variable a tainted proto value was read
// out of. "header := card.Header" makes header an alias of a field of
// card: writing a carrier literal through header writes it into card,
// so card carries the text too and its route is the one that counts.
// Only proto message values alias this way, which is why the origin of
// the right-hand side is checked instead of its spelling.
func (d *discoverer) expandProtoAliases(scope *fileScope, fn *ast.FuncDecl, tainted map[string]bool) {
	for round := 0; round < maxFlowRounds; round++ {
		grew := false
		ast.Inspect(fn.Body, func(n ast.Node) bool {
			assign, ok := n.(*ast.AssignStmt)
			if !ok || len(assign.Lhs) != len(assign.Rhs) {
				return true
			}
			for i, lhs := range assign.Lhs {
				name := baseIdentName(lhs)
				if name == "" || !tainted[name] {
					continue
				}
				switch assign.Rhs[i].(type) {
				case *ast.SelectorExpr, *ast.IndexExpr, *ast.StarExpr:
				default:
					continue
				}
				if d.resolve.originOfValueExpr(scope, fn, assign.Rhs[i], 0).Kind != OriginProto {
					continue
				}
				source := baseIdentName(assign.Rhs[i])
				if source != "" && !tainted[source] {
					tainted[source] = true
					grew = true
				}
			}
			return true
		})
		if !grew {
			return
		}
	}
}
