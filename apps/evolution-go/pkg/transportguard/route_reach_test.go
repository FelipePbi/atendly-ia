package transportguard

import (
	"strconv"
	"strings"
	"testing"
)

// reachedProseExpectation is one asserted member of a set the guard
// computes: the route the reach started from, the source position of the
// literal relative to the module root, the content of the literal, and
// the carrier field it is written into.
type reachedProseExpectation struct {
	Route    string
	Location string
	Content  string
	Field    string
}

// productProseLiteralLocation is the source position of the one literal
// the Goal singles out as product prose composed inside the transport
// fork (A-24). Only the position is written here: the content is read
// from the set the guard derives, never typed into this file, so the
// negative proof below cannot be satisfied by a string that merely looks
// right.
const productProseLiteralLocation = "pkg/sendMessage/service/send_service.go:1960"

// expectedProseLiteralsReachedFromProductRoutes is the set of non-empty
// Go literals reachable from a route the product actually calls —
// the routes of the value file WU-02 derived from the two product trees,
// matched against this tree by WU-03 — asserted element by element.
//
// The set is empty, and that is a computed fact, not a missing
// assertion. The product reaches ten routes of this service; nine of
// them have a handler to walk, and GET /health is refused because its
// registered handler is a local closure, counted and not lost. The only
// one of the nine walked routes that writes text carrier fields at all
// is POST /send/text, whose reach holds carrier writes whose value is
// the relayed request body and no Go literal. The prose this fork
// composes — the button discriminators, the JSON envelopes, the formatting marks and the
// "Ver Menu" label — lives behind /send/button, /send/list,
// /send/carousel, /send/media and /send/status/media, and the product
// calls none of those.
//
// The emptiness is guarded from both sides: the test below refuses a set
// computed from an empty reach, so a walk that stopped reaching anything
// fails here instead of producing the same empty answer, and a literal
// that becomes reachable from a product route fails with its file and
// its line.
var expectedProseLiteralsReachedFromProductRoutes = []reachedProseExpectation{}

// expectedProseLiteralsReachedFromRegisteredRoutes is the same set taken
// over every route this tree registers, asserted element by element. It
// is what makes the empty set above meaningful: the machinery that finds
// nothing from a product route finds twenty-seven literals from five
// routes of the same tree, each with the route it is reached from.
//
// The reach is the over-approximating one — every production
// declaration the handler calls — so a literal is attributed to a route
// whenever some path from that route can write it. See RouteProseReach
// for why the over-approximation is the fail-closed direction.
var expectedProseLiteralsReachedFromRegisteredRoutes = []reachedProseExpectation{
	{Route: "POST /send/media", Location: "pkg/sendMessage/service/send_service.go:964", Content: "image/jpeg", Field: "Mimetype"},
	{Route: "POST /send/media", Location: "pkg/sendMessage/service/send_service.go:992", Content: "audio/ogg; codecs=opus", Field: "Mimetype"},
	{Route: "POST /send/media", Location: "pkg/sendMessage/service/send_service.go:1232", Content: "video/mp4", Field: "Mimetype"},
	{Route: "POST /send/media", Location: "pkg/sendMessage/service/send_service.go:1248", Content: "image/jpeg", Field: "Mimetype"},
	{Route: "POST /send/media", Location: "pkg/sendMessage/service/send_service.go:1275", Content: "audio/ogg; codecs=opus", Field: "Mimetype"},
	{Route: "POST /send/button", Location: "pkg/sendMessage/service/send_service.go:1740", Content: "quick_reply", Field: "Name"},
	{Route: "POST /send/button", Location: "pkg/sendMessage/service/send_service.go:1741", Content: "{\"display_text\":\"", Field: "ButtonParamsJSON"},
	{Route: "POST /send/button", Location: "pkg/sendMessage/service/send_service.go:1743", Content: "cta_copy", Field: "Name"},
	{Route: "POST /send/button", Location: "pkg/sendMessage/service/send_service.go:1744", Content: "{\"display_text\":\"", Field: "ButtonParamsJSON"},
	{Route: "POST /send/button", Location: "pkg/sendMessage/service/send_service.go:1746", Content: "cta_url", Field: "Name"},
	{Route: "POST /send/button", Location: "pkg/sendMessage/service/send_service.go:1747", Content: "{\"display_text\":\"", Field: "ButtonParamsJSON"},
	{Route: "POST /send/button", Location: "pkg/sendMessage/service/send_service.go:1749", Content: "cta_call", Field: "Name"},
	{Route: "POST /send/button", Location: "pkg/sendMessage/service/send_service.go:1750", Content: "{\"display_text\":\"", Field: "ButtonParamsJSON"},
	{Route: "POST /send/button", Location: "pkg/sendMessage/service/send_service.go:1753", Content: "payment_info", Field: "Name"},
	{Route: "POST /send/button", Location: "pkg/sendMessage/service/send_service.go:1765", Content: "{\"from\":\"api\",\"templateId\":", Field: "MessageParamsJSON"},
	{Route: "POST /send/button", Location: "pkg/sendMessage/service/send_service.go:1782", Content: "*", Field: "Text"},
	{Route: "POST /send/button", Location: "pkg/sendMessage/service/send_service.go:1784", Content: "\n\n", Field: "Text"},
	{Route: "POST /send/list", Location: "pkg/sendMessage/service/send_service.go:1960", Content: "Ver Menu", Field: "ButtonText"},
	{Route: "POST /send/list", Location: "pkg/sendMessage/service/send_service.go:1968", Content: " ", Field: "Title"},
	{Route: "POST /send/list", Location: "pkg/sendMessage/service/send_service.go:1974", Content: " ", Field: "Title"},
	{Route: "POST /send/carousel", Location: "pkg/sendMessage/service/send_service.go:2547", Content: "image/jpeg", Field: "Mimetype"},
	{Route: "POST /send/carousel", Location: "pkg/sendMessage/service/send_service.go:2572", Content: "video/mp4", Field: "Mimetype"},
	{Route: "POST /send/carousel", Location: "pkg/sendMessage/service/send_service.go:2606", Content: "cta_url", Field: "Name"},
	{Route: "POST /send/carousel", Location: "pkg/sendMessage/service/send_service.go:2610", Content: "cta_call", Field: "Name"},
	{Route: "POST /send/carousel", Location: "pkg/sendMessage/service/send_service.go:2614", Content: "cta_copy", Field: "Name"},
	{Route: "POST /send/carousel", Location: "pkg/sendMessage/service/send_service.go:2620", Content: "quick_reply", Field: "Name"},
	{Route: "POST /send/status/media", Location: "pkg/sendMessage/service/send_service.go:2824", Content: "image/jpeg", Field: "Mimetype"},
}

// reachedProseExpectationsOf renders computed literals the way the
// asserted sets spell them, with the file part relative to the module
// root.
func reachedProseExpectationsOf(t *testing.T, literals []ReachedProseLiteral) []reachedProseExpectation {
	t.Helper()
	out := make([]reachedProseExpectation, 0, len(literals))
	for _, literal := range literals {
		out = append(out, reachedProseExpectation{
			Route:    literal.RouteMethod + " " + literal.RoutePath,
			Location: positionRelativeToModuleRoot(t, literal.File, literal.Line),
			Content:  literal.Content,
			Field:    literal.Field,
		})
	}
	return out
}

// assertSameReachedProseSet compares a computed set against an asserted
// one in both directions and by size, so a member that appears, moves,
// changes content or changes field fails with its file and its line.
func assertSameReachedProseSet(t *testing.T, what string, actual, expected []reachedProseExpectation) {
	t.Helper()
	asserted := map[reachedProseExpectation]bool{}
	for _, want := range expected {
		asserted[want] = true
	}
	found := map[reachedProseExpectation]bool{}
	for _, got := range actual {
		found[got] = true
	}
	for _, got := range actual {
		if !asserted[got] {
			t.Errorf("%s: a literal reachable from a route is not in the asserted set: %s reaches %s, which writes %q into %s",
				what, got.Route, got.Location, got.Content, got.Field)
		}
	}
	for _, want := range expected {
		if !found[want] {
			t.Errorf("%s: an asserted literal is no longer reachable from its route: %s used to reach %s, which wrote %q into %s",
				what, want.Route, want.Location, want.Content, want.Field)
		}
	}
	if len(actual) != len(expected) {
		t.Errorf("%s: the computed set has %d members, the assertion names %d", what, len(actual), len(expected))
	}
}

// productReachedRoutes matches the value file of routes the product
// reaches against this tree and returns the registered routes it
// reaches, so nothing about the product set is typed inside this file.
func productReachedRoutes(t *testing.T, enumeration *Enumeration) []RegisteredRoute {
	t.Helper()
	entries, err := ReadProductTransportRoutesFile(productTransportRoutesPathFromPackage())
	if err != nil {
		t.Fatalf("the product transport routes file could not be read: %v", err)
	}
	report, err := enumeration.MatchProductTransportRoutes(entries)
	if err != nil {
		t.Fatalf("an entry of the product transport routes file did not match exactly one registered route: %v", err)
	}
	routes := make([]RegisteredRoute, 0, len(report.Matches))
	for _, match := range report.Matches {
		routes = append(routes, match.Route)
	}
	if len(routes) == 0 {
		t.Fatal("no registered route was matched from the product transport routes file")
	}
	return routes
}

// TestProseLiteralsReachedFromAProductRouteAreAssertedElementByElement
// crosses the two halves of the fork boundary: the routes the product
// reaches, and the non-empty Go literals Goal042 asserted. Every literal
// reachable from a reached route is named with its file, its line, its
// content, its field and the route it is reached from.
func TestProseLiteralsReachedFromAProductRouteAreAssertedElementByElement(t *testing.T) {
	enumeration := enumerateRealTree(t)
	routes := productReachedRoutes(t, enumeration)

	report, err := enumeration.ProseReachOfRoutes(routes)
	if err != nil {
		t.Fatalf("the reach of a route the product calls could not be walked: %v", err)
	}

	var actual []reachedProseExpectation
	declarations, sites := 0, 0
	for _, reach := range report.Reaches {
		declarations += len(reach.Declarations)
		sites += len(reach.Sites)
		actual = append(actual, reachedProseExpectationsOf(t, reach.Literals)...)
		t.Logf("%s %s reaches %d declarations, %d carrier sites and %d literals",
			reach.Route.Method, reach.Route.FullPath, len(reach.Declarations), len(reach.Sites), len(reach.Literals))
	}

	// A route the product calls whose handler is not a declaration of
	// this tree has no production code to walk. It is counted with its
	// reason, never dropped in silence, and never mistaken for a route
	// that was walked and found nothing.
	for _, refusal := range report.Refusals {
		if refusal.Reason == "" {
			t.Errorf("route %s %s has no handler declaration and no written reason",
				refusal.Route.Method, refusal.Route.FullPath)
		}
		t.Logf("%s %s is refused: %s", refusal.Route.Method, refusal.Route.FullPath, refusal.Reason)
	}
	if len(report.Reaches)+len(report.Refusals) != len(routes) {
		t.Errorf("the %d routes the product calls produced %d reaches and %d refusals; every route must end in one or the other",
			len(routes), len(report.Reaches), len(report.Refusals))
	}

	// A reach that stopped walking would also report no literal. The two
	// numbers below are what tells an empty answer apart from a dead one.
	if declarations == 0 {
		t.Fatal("the reach from the routes the product calls walked no declaration at all")
	}
	if sites == 0 {
		t.Fatal("the reach from the routes the product calls found no text carrier site, so an empty literal set proves nothing")
	}
	if len(enumeration.GoProseLiteralsReachingTransport()) == 0 {
		t.Fatal("the tree holds no non-empty Go literal reaching the transport, so there was nothing to cross with")
	}

	assertSameReachedProseSet(t, "literals reachable from a route the product calls",
		actual, expectedProseLiteralsReachedFromProductRoutes)
}

// TestProseLiteralsReachedFromEveryRegisteredRouteAreAssertedElementByElement
// is the same set over the whole tree, and it carries the non-vacuity of
// the invariant: the assertion is made about the computed result, and it
// states that at least one registered route reaches at least one
// literal. A reach that found nothing anywhere would fail here.
func TestProseLiteralsReachedFromEveryRegisteredRouteAreAssertedElementByElement(t *testing.T) {
	enumeration := enumerateRealTree(t)

	report, err := enumeration.ProseReachOfEveryRegisteredRoute()
	if err != nil {
		t.Fatalf("the reach of a registered route could not be walked: %v", err)
	}

	routesWithLiterals := 0
	for _, reach := range report.Reaches {
		if len(reach.Literals) > 0 {
			routesWithLiterals++
		}
	}
	if routesWithLiterals == 0 {
		t.Fatal("no registered route reaches a non-empty Go literal; the computed result makes the invariant vacuous")
	}
	t.Logf("%d of %d walked routes reach at least one literal", routesWithLiterals, len(report.Reaches))
	t.Logf("%s", report.Report())

	assertSameReachedProseSet(t, "literals reachable from a registered route",
		reachedProseExpectationsOf(t, report.Literals()), expectedProseLiteralsReachedFromRegisteredRoutes)

	// Routes whose handler is not a declaration of this tree have no
	// production code to walk. They are counted with their reason, not
	// dropped in silence.
	if len(report.Refusals) == 0 {
		t.Error("no route was refused for having no handler declaration, so the refusal path is not exercised")
	}
	for _, refusal := range report.Refusals {
		if refusal.Reason == "" {
			t.Errorf("route %s %s has no handler declaration and no written reason",
				refusal.Route.Method, refusal.Route.FullPath)
		}
	}
}

// TestNoRouteThatReachesTheProductProseLiteralIsReachedByTheProduct is
// the negative the Goal asks to be computed rather than stated: the
// routes that reach the product prose literal are derived from the
// reaches, the routes the product calls are derived from the value file,
// and the two sets are disjoint. Neither side is typed here, and the
// content of the literal is read from the set the guard derives.
func TestNoRouteThatReachesTheProductProseLiteralIsReachedByTheProduct(t *testing.T) {
	enumeration := enumerateRealTree(t)

	var literal GoProseLiteral
	found := false
	for _, candidate := range enumeration.GoProseLiteralsReachingTransport() {
		if positionRelativeToModuleRoot(t, candidate.File, candidate.Line) == productProseLiteralLocation {
			literal = candidate
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("no non-empty Go literal is derived at %s; the position the Goal names is not in the computed set",
			productProseLiteralLocation)
	}
	if literal.Content == "" {
		t.Fatalf("the literal derived at %s has no content", productProseLiteralLocation)
	}
	t.Logf("the literal derived at %s writes %q into %v", productProseLiteralLocation, literal.Content, literal.Fields)

	report, err := enumeration.ProseReachOfEveryRegisteredRoute()
	if err != nil {
		t.Fatalf("the reach of a registered route could not be walked: %v", err)
	}
	reaching := report.RoutesReachingLiteralAt(literal.File, literal.Line)
	if len(reaching) == 0 {
		t.Fatalf("no registered route reaches the literal at %s, so its absence from the product set proves nothing",
			productProseLiteralLocation)
	}

	product := map[string]RegisteredRoute{}
	for _, route := range productReachedRoutes(t, enumeration) {
		product[route.Position()] = route
	}
	for _, route := range reaching {
		t.Logf("the literal at %s is reachable from %s %s registered at %s",
			productProseLiteralLocation, route.Method, route.FullPath,
			positionRelativeToModuleRoot(t, route.File, route.Line))
		if _, reached := product[route.Position()]; reached {
			t.Errorf("route %s %s reaches the literal at %s and is in the set the product calls",
				route.Method, route.FullPath, productProseLiteralLocation)
		}
	}

	// The derived content and the content Goal042 asserted at the same
	// position must be the same string. This is the only place the two
	// meet, and it is a comparison between a computed value and an
	// asserted one, not a literal typed to make the proof pass.
	asserted := ""
	for _, want := range expectedGoProseLiterals {
		if want.Location == productProseLiteralLocation {
			asserted = want.Content
		}
	}
	if asserted != literal.Content {
		t.Errorf("the literal derived at %s is %q, the set Goal042 asserted holds %q",
			productProseLiteralLocation, literal.Content, asserted)
	}
}

// TestEveryReachedLiteralIsAMemberOfTheGoal042Set holds the residue-zero
// requirement across the two Goals: the crossing adds nothing to the set
// Goal042 proved and loses nothing from it. A literal reachable from a
// route that the earlier set does not hold, and a literal of the earlier
// set that no route reaches, both fail here with the position.
func TestEveryReachedLiteralIsAMemberOfTheGoal042Set(t *testing.T) {
	enumeration := enumerateRealTree(t)

	transport := map[string]GoProseLiteral{}
	for _, literal := range enumeration.GoProseLiteralsReachingTransport() {
		transport[literal.Position()] = literal
	}
	if len(transport) == 0 {
		t.Fatal("the set of non-empty Go literals reaching the transport is empty")
	}

	report, err := enumeration.ProseReachOfEveryRegisteredRoute()
	if err != nil {
		t.Fatalf("the reach of a registered route could not be walked: %v", err)
	}

	reached := map[string]bool{}
	for _, literal := range report.Literals() {
		reached[literal.Position()] = true
		carrier, member := transport[literal.Position()]
		if !member {
			t.Errorf("a literal reachable from %s %s at %s is not in the set of literals reaching the transport",
				literal.RouteMethod, literal.RoutePath, positionRelativeToModuleRoot(t, literal.File, literal.Line))
			continue
		}
		if carrier.Content != literal.Content {
			t.Errorf("the literal at %s reads %q through the reach and %q through the transport set",
				positionRelativeToModuleRoot(t, literal.File, literal.Line), literal.Content, carrier.Content)
		}
	}
	for position, literal := range transport {
		if !reached[position] {
			t.Errorf("the literal %q at %s reaches the transport and no registered route reaches it",
				literal.Content, positionRelativeToModuleRoot(t, literal.File, literal.Line))
		}
	}
	t.Logf("%d literals reach the transport, and every one of them is reachable from a registered route", len(transport))
}

// TestTheWideReachContainsTheNarrowChain is the relation between the two
// readings of the same walk: everything ChainFrom reaches by following
// the request body is also in the over-approximating reach. If it were
// not, the reach would be missing a path the narrow reading already
// finds, and the fail-closed direction would be the wrong way round.
func TestTheWideReachContainsTheNarrowChain(t *testing.T) {
	enumeration := enumerateRealTree(t)

	report, err := enumeration.ProseReachOfEveryRegisteredRoute()
	if err != nil {
		t.Fatalf("the reach of a registered route could not be walked: %v", err)
	}

	withChain, withRelay := 0, 0
	for _, reach := range report.Reaches {
		if reach.ChainReason != "" {
			if len(reach.ChainSites) != 0 {
				t.Errorf("route %s %s has a reason why the body could not be followed and chain sites all the same",
					reach.Route.Method, reach.Route.FullPath)
			}
			continue
		}
		withChain++
		wide := map[string]bool{}
		for _, site := range reach.Sites {
			wide[site.Position()] = true
		}
		for _, site := range reach.ChainSites {
			if !wide[site.Position()] {
				t.Errorf("route %s %s follows the request body into %s, which its reach does not hold",
					reach.Route.Method, reach.Route.FullPath, positionRelativeToModuleRoot(t, site.File, site.Line))
			}
		}
		if len(reach.RelaySites) > 0 {
			withRelay++
		}
	}
	if withChain == 0 {
		t.Fatal("no registered route had its request body followed, so the narrow reading is not being exercised")
	}
	if withRelay == 0 {
		t.Fatal("no registered route reaches a site whose every field comes from the request body")
	}
	t.Logf("%d walked routes bind a request body, %d of them relay it into a carrier site", withChain, withRelay)
}

// TestARouteWithNoHandlerDeclarationIsRefusedInsteadOfReadAsEmpty is the
// fail-closed half of the reach: a route whose handler this tree does
// not declare fails with the route and the reason, rather than returning
// a reach that holds nothing.
func TestARouteWithNoHandlerDeclarationIsRefusedInsteadOfReadAsEmpty(t *testing.T) {
	enumeration := &Enumeration{}
	route := RegisteredRoute{
		Method:   "GET",
		FullPath: "/health",
		File:     "routes.go",
		Line:     42,
		Reason:   "the registered handler is not a method value of this tree",
	}

	reach, err := enumeration.ProseReachFrom(route)
	if err == nil {
		t.Fatal("a route with no handler declaration was walked without complaint")
	}
	if len(reach.Literals) != 0 || len(reach.Declarations) != 0 {
		t.Errorf("the refused reach is not empty: %d declarations, %d literals", len(reach.Declarations), len(reach.Literals))
	}
	message := err.Error()
	for _, part := range []string{"GET", "/health", "routes.go:" + strconv.Itoa(route.Line), route.Reason} {
		if !strings.Contains(message, part) {
			t.Errorf("the failure does not name %q: %v", part, err)
		}
	}
}
