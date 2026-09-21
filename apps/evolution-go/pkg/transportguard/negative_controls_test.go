package transportguard

import (
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// The five negative controls of §4 live here. Each one builds a whole
// synthetic module in a temporary directory and runs the real guard over
// it, so the invariant is exercised on the artifact the criterion names
// without the real tree ever being broken. t.TempDir removes the tree
// when the test ends, which is why no control leaves residue behind.

// syntheticTree is a module written to a temporary directory: a go.mod
// with the vendorized transport library redirected the way the real one
// is, the generated proto declarations the carrier fields are derived
// from, the transport library itself, and whatever production files the
// control needs.
type syntheticTree struct {
	root string
}

func writeTempFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("could not create %s: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("could not write %s: %v", path, err)
	}
}

const syntheticModulePath = "example.test/synthetic"
const syntheticLibraryPath = "transport.test/wa"

// newSyntheticTree lays down the parts every control needs and returns
// the module root.
func newSyntheticTree(t *testing.T) *syntheticTree {
	t.Helper()
	root := t.TempDir()
	tree := &syntheticTree{root: root}

	tree.write(t, "go.mod", "module "+syntheticModulePath+"\n\ngo 1.25.0\n\nreplace "+
		syntheticLibraryPath+" => ./whatsmeow-lib\n")

	// The generated message declarations. The carrier fields are derived
	// from these, exactly as they are from the real ones: a struct with a
	// protoimpl.MessageState field is a message, and its *string fields
	// carry text.
	tree.write(t, filepath.Join("whatsmeow-lib", "proto", "waE2E", "WAWebProtobufsE2E.pb.go"),
		`package waE2E

import "google.golang.org/protobuf/runtime/protoimpl"

type Message struct {
	state               protoimpl.MessageState
	Conversation        *string
	ExtendedTextMessage *ExtendedTextMessage
}

type ExtendedTextMessage struct {
	state protoimpl.MessageState
	Text  *string
}
`)

	// The transport library: the client that owns the socket. A method
	// that takes a message and gives no message back transmits it.
	tree.write(t, filepath.Join("whatsmeow-lib", "client.go"),
		`package wa

import "`+syntheticLibraryPath+`/proto/waE2E"

type Client struct{}

func (c *Client) SendMessage(to string, msg *waE2E.Message) error {
	return nil
}
`)

	// cmd exists because the discoverer walks both production subtrees.
	tree.write(t, filepath.Join("cmd", "app", "main.go"), "package main\n\nfunc main() {}\n")

	return tree
}

func (s *syntheticTree) write(t *testing.T, relative, content string) {
	t.Helper()
	writeTempFile(t, filepath.Join(s.root, relative), content)
}

// relayServiceSource is a production file that relays: the text written
// into the carrier field is a field of the request body the function
// received. It is the shape every control varies from.
func relayServiceSource(pkgName string) string {
	return `package ` + pkgName + `

import (
	"` + syntheticLibraryPath + `"
	"` + syntheticLibraryPath + `/proto/waE2E"
)

type Body struct {
	Number string
	Text   string
}

type Service struct {
	client   *wa.Client
	Greeting string
}

func (s *Service) SendText(data *Body) error {
	msg := &waE2E.Message{
		ExtendedTextMessage: &waE2E.ExtendedTextMessage{
			Text: &data.Text,
		},
	}
	return s.client.SendMessage(data.Number, msg)
}
`
}

func enumerateSynthetic(t *testing.T, tree *syntheticTree) (*Enumeration, error) {
	t.Helper()
	return Enumerate(tree.root)
}

func mustEnumerateSynthetic(t *testing.T, tree *syntheticTree) *Enumeration {
	t.Helper()
	enumeration, err := enumerateSynthetic(t, tree)
	if err != nil {
		t.Fatalf("the synthetic tree left residue: %v", err)
	}
	return enumeration
}

func syntheticPosition(t *testing.T, tree *syntheticTree, file string, line int) string {
	t.Helper()
	relative, err := filepath.Rel(tree.root, file)
	if err != nil {
		t.Fatalf("could not relativize %s: %v", file, err)
	}
	return filepath.ToSlash(relative) + ":" + strconv.Itoa(line)
}

// Control 1 — a Go prose literal in a text-carrying field delivered to a
// number is reported with its file, its line and its category, and the
// assertion of §2 refuses it.
func TestNegativeControl1GoProseLiteralInACarrierFieldIsRefused(t *testing.T) {
	tree := newSyntheticTree(t)
	tree.write(t, filepath.Join("pkg", "svc", "service.go"), relayServiceSource("svc"))
	tree.write(t, filepath.Join("pkg", "svc", "notice.go"),
		`package svc

import "`+syntheticLibraryPath+`/proto/waE2E"

func (s *Service) SendNotice(number string) error {
	notice := "Sua consulta foi confirmada"
	msg := &waE2E.Message{
		ExtendedTextMessage: &waE2E.ExtendedTextMessage{
			Text: &notice,
		},
	}
	return s.client.SendMessage(number, msg)
}
`)

	enumeration := mustEnumerateSynthetic(t, tree)

	// The assertion of §2 is the set being named element by element. On
	// a tree where no prose is declared, this literal is an unasserted
	// member, and that is the failure.
	declared := map[string]bool{}
	var refused []string
	for _, literal := range enumeration.GoProseLiteralsReachingTransport() {
		position := syntheticPosition(t, tree, literal.File, literal.Line)
		if declared[position] {
			continue
		}
		refused = append(refused, position+" writes "+strconv.Quote(literal.Content)+
			" into "+strings.Join(literal.Fields, ",")+" with category "+string(SourceGoLiteral))
	}
	if len(refused) != 1 {
		t.Fatalf("expected exactly one refused prose literal, got %d: %v", len(refused), refused)
	}
	if !strings.HasPrefix(refused[0], "pkg/svc/notice.go:6") {
		t.Errorf("the refusal does not name the offending file and line: %s", refused[0])
	}
	if !strings.Contains(refused[0], "Sua consulta foi confirmada") {
		t.Errorf("the refusal does not quote the literal: %s", refused[0])
	}
	if !strings.Contains(refused[0], "Text") {
		t.Errorf("the refusal does not name the carrier field: %s", refused[0])
	}
	t.Logf("control 1, final tree: %s", refused[0])

	// The relay in the same tree is not refused, which is what makes the
	// control a control rather than a rule that refuses everything.
	for _, site := range enumeration.Sites {
		if !strings.Contains(site.File, "service.go") {
			continue
		}
		for _, origin := range site.FieldOrigins {
			if origin.Category != SourceRouteBody {
				t.Errorf("the relay site was classified as %s", origin.Category)
			}
		}
	}
}

// Control 2 — a second carrier field written from instance
// configuration is reported by the asserted set, with its file and its
// line, even though the text itself is legitimate.
func TestNegativeControl2ASecondInstanceConfigurationSourceIsRefused(t *testing.T) {
	tree := newSyntheticTree(t)
	tree.write(t, filepath.Join("pkg", "svc", "service.go"), relayServiceSource("svc"))
	tree.write(t, filepath.Join("pkg", "svc", "greeting.go"),
		`package svc

import "`+syntheticLibraryPath+`/proto/waE2E"

func (s *Service) SendGreeting(number string) error {
	msg := &waE2E.Message{
		ExtendedTextMessage: &waE2E.ExtendedTextMessage{
			Text: &s.Greeting,
		},
	}
	return s.client.SendMessage(number, msg)
}
`)
	tree.write(t, filepath.Join("pkg", "svc", "farewell.go"),
		`package svc

import "`+syntheticLibraryPath+`/proto/waE2E"

func (s *Service) SendFarewell(number string) error {
	msg := &waE2E.Message{
		ExtendedTextMessage: &waE2E.ExtendedTextMessage{
			Text: &s.Greeting,
		},
	}
	return s.client.SendMessage(number, msg)
}
`)

	enumeration := mustEnumerateSynthetic(t, tree)

	// The set is asserted with one member, the way the real tree asserts
	// the reject-call message. The second one is what the set catches.
	asserted := map[string]bool{"pkg/svc/farewell.go:8": true}
	var refused []string
	for _, source := range enumeration.OffRelaySources() {
		if source.Category != SourceInstanceConfig {
			continue
		}
		position := syntheticPosition(t, tree, source.File, source.Line)
		if asserted[position] {
			continue
		}
		refused = append(refused, position+" writes "+source.MessageType+"."+source.FieldName+
			" from "+string(source.Category))
	}
	if len(refused) != 1 {
		t.Fatalf("expected the asserted set to refuse exactly one new member, got %d: %v", len(refused), refused)
	}
	if !strings.HasPrefix(refused[0], "pkg/svc/greeting.go:8") {
		t.Errorf("the refusal does not name the offending file and line: %s", refused[0])
	}
	t.Logf("control 2, final tree: %s", refused[0])
}

// Control 3 — a carrier field fed by a shape the guard does not
// recognize becomes named residue with its file and its line. It never
// passes in silence, and the enumeration is refused as a whole.
func TestNegativeControl3AnUnrecognizedShapeBecomesNamedResidue(t *testing.T) {
	tree := newSyntheticTree(t)
	tree.write(t, filepath.Join("pkg", "svc", "service.go"), relayServiceSource("svc"))
	tree.write(t, filepath.Join("pkg", "svc", "indexed.go"),
		`package svc

import "`+syntheticLibraryPath+`/proto/waE2E"

func (s *Service) SendIndexed(number string, values []string, at int) error {
	msg := &waE2E.Message{
		ExtendedTextMessage: &waE2E.ExtendedTextMessage{
			Text: &values[at],
		},
	}
	return s.client.SendMessage(number, msg)
}
`)

	enumeration, err := enumerateSynthetic(t, tree)
	if err == nil {
		t.Fatalf("an unrecognized shape was accepted; the enumeration returned %d sites", len(enumeration.Sites))
	}
	message := err.Error()
	if !strings.Contains(filepath.ToSlash(message), "pkg/svc/indexed.go:8") {
		t.Errorf("the residue does not name the offending file and line: %s", message)
	}
	if !strings.Contains(message, "does not classify") {
		t.Errorf("the residue does not say the shape was unrecognized: %s", message)
	}
	t.Logf("control 3, final tree: %s", message)
}

// Control 4 — the same site written in a file and a folder of another
// name is classified identically. No rule decides by name.
func TestNegativeControl4MovingASiteDoesNotChangeItsClassification(t *testing.T) {
	first := newSyntheticTree(t)
	first.write(t, filepath.Join("pkg", "svc", "service.go"), relayServiceSource("svc"))
	firstEnumeration := mustEnumerateSynthetic(t, first)

	second := newSyntheticTree(t)
	second.write(t, filepath.Join("pkg", "zulu", "outbound_dispatch.go"), relayServiceSource("zulu"))
	secondEnumeration := mustEnumerateSynthetic(t, second)

	if len(firstEnumeration.Sites) != 1 || len(secondEnumeration.Sites) != 1 {
		t.Fatalf("expected one site on each tree, got %d and %d",
			len(firstEnumeration.Sites), len(secondEnumeration.Sites))
	}
	before, after := firstEnumeration.Sites[0], secondEnumeration.Sites[0]

	if before.Category != after.Category {
		t.Errorf("the category changed with the name: %s became %s", before.Category, after.Category)
	}
	if before.Composition != after.Composition {
		t.Errorf("the composition changed with the name: %s became %s", before.Composition, after.Composition)
	}
	if before.MessageType != after.MessageType {
		t.Errorf("the message type changed with the name: %s became %s", before.MessageType, after.MessageType)
	}
	if !sameStrings(before.CarrierFields, after.CarrierFields) {
		t.Errorf("the carrier fields changed with the name: %v became %v", before.CarrierFields, after.CarrierFields)
	}
	if len(before.FieldOrigins) != len(after.FieldOrigins) {
		t.Fatalf("the number of classified origins changed with the name: %d became %d",
			len(before.FieldOrigins), len(after.FieldOrigins))
	}
	for i := range before.FieldOrigins {
		if before.FieldOrigins[i].Category != after.FieldOrigins[i].Category {
			t.Errorf("origin %d changed with the name: %s became %s",
				i, before.FieldOrigins[i].Category, after.FieldOrigins[i].Category)
		}
	}

	firstCalls := firstEnumeration.CallCountsByCategory()
	secondCalls := secondEnumeration.CallCountsByCategory()
	if len(firstCalls) != len(secondCalls) {
		t.Fatalf("the call categories changed with the name: %v became %v", firstCalls, secondCalls)
	}
	for category, count := range firstCalls {
		if secondCalls[category] != count {
			t.Errorf("category %s counted %d before the move and %d after", category, count, secondCalls[category])
		}
	}
	t.Logf("control 4, final tree: %s in pkg/svc/service.go and %s in pkg/zulu/outbound_dispatch.go are the same classification",
		before.Category, after.Category)
}

// Control 5, Go half — a boundary value that is not a registered route
// fails with the paths that were computed, and a boundary key that is
// missing fails instead of skipping.
func TestNegativeControl5TheBoundaryValueBitesOnTheGoSide(t *testing.T) {
	tree := newSyntheticTree(t)
	tree.write(t, filepath.Join("pkg", "svc", "service.go"), relayServiceSource("svc"))
	tree.write(t, filepath.Join("pkg", "routes", "routes.go"),
		`package routes

import "net/http"

type Handlers struct {
	send *Send
}

type Send struct{}

func (s *Send) Text(w http.ResponseWriter) {}

func (h *Handlers) Assign(engine *http.ServeMux) {
	group := engine.Group("/send")
	group.POST("/text", h.send.Text)
}
`)
	enumeration := mustEnumerateSynthetic(t, tree)

	if _, err := enumeration.RouteWithPath("/send/text"); err != nil {
		t.Fatalf("the registered route was not found: %v", err)
	}

	if _, err := enumeration.RouteWithPath("/send/nowhere"); err == nil {
		t.Error("a path that is not a registered route was accepted")
	} else {
		t.Logf("control 5, Go side, unregistered path: %v", err)
	}

	dir := t.TempDir()
	withoutKey := filepath.Join(dir, "no-key.env")
	writeTempFile(t, withoutKey, "# no boundary key here\nOTHER=1\n")
	if _, err := ReadEnvFileValue(withoutKey, BoundaryPathEnvKey); err == nil {
		t.Error("a missing boundary key was skipped instead of failing")
	} else {
		t.Logf("control 5, Go side, missing key: %v", err)
	}
}

/* =========================================================================
 * The five negative controls of §4 (Goal043 / WU-05). Each one exercises
 * the artifact the criterion names — real AST route enumeration, real
 * value-file matching, real prose reach — over a synthetic tree in a
 * temporary directory, never the real one.
 * ========================================================================= */

// syntheticRoutesFile is the routes.go the Goal043 controls share: one
// router group, one registered route, one handler type — written with the
// package, folder, type and handler names the caller supplies, so the
// same shape can be built twice under different names.
func syntheticRoutesFile(pkgName, routerTypeName, routerFieldType, groupPath, registeredPath, handlerMethodName string) string {
	return `package ` + pkgName + `

import "net/http"

type ` + routerTypeName + ` struct {
	target *` + routerFieldType + `
}

type ` + routerFieldType + ` struct{}

func (t *` + routerFieldType + `) ` + handlerMethodName + `(w http.ResponseWriter) {}

func (h *` + routerTypeName + `) Assign(engine *http.ServeMux) {
	group := engine.Group("` + groupPath + `")
	group.POST("` + registeredPath + `", h.target.` + handlerMethodName + `)
}
`
}

// TestNegativeControl2Goal043AnUnmatchedProductRouteEntryFailsWithTheEntry
// is criterion 21's control 2: an entry of the product transport routes
// file that does not correspond to exactly one registered route fails
// with the entry printed — by method, by an extra segment, and by a
// missing file — exercised over a real AST route enumeration, not a
// hand-built Enumeration.
func TestNegativeControl2Goal043AnUnmatchedProductRouteEntryFailsWithTheEntry(t *testing.T) {
	tree := newSyntheticTree(t)
	tree.write(t, filepath.Join("pkg", "routes", "routes.go"),
		syntheticRoutesFile("routes", "Handlers", "Send", "/send", "/text", "Text"))
	enumeration := mustEnumerateSynthetic(t, tree)

	if _, err := enumeration.RouteWithPath("/send/text"); err != nil {
		t.Fatalf("the registered route was not found: %v", err)
	}

	t.Run("método diferente", func(t *testing.T) {
		entries := []ProductRouteEntry{{Method: "GET", Path: "/send/text", Line: 1}}
		_, err := enumeration.MatchProductTransportRoutes(entries)
		if err == nil {
			t.Fatal("an entry whose method does not match the registered route was accepted")
		}
		if !strings.Contains(err.Error(), "GET /send/text") {
			t.Errorf("the failure does not print the offending entry: %v", err)
		}
		t.Logf("control 2, final tree, method mismatch: %v", err)
	})

	t.Run("segmento a mais", func(t *testing.T) {
		entries := []ProductRouteEntry{{Method: "POST", Path: "/send/text/extra", Line: 1}}
		_, err := enumeration.MatchProductTransportRoutes(entries)
		if err == nil {
			t.Fatal("an entry with an extra path segment was accepted")
		}
		if !strings.Contains(err.Error(), "POST /send/text/extra") {
			t.Errorf("the failure does not print the offending entry: %v", err)
		}
		t.Logf("control 2, final tree, extra segment: %v", err)
	})

	t.Run("arquivo ausente", func(t *testing.T) {
		missing := filepath.Join(t.TempDir(), "does-not-exist.txt")
		if _, err := ReadProductTransportRoutesFile(missing); err == nil {
			t.Fatal("a missing product transport routes file was read without complaint")
		} else {
			t.Logf("control 2, final tree, missing file: %v", err)
		}
	})
}

// TestNegativeControl3Goal043ANewLiteralReachableFromAProductRouteIsRefused
// is criterion 21's control 3: a Go prose literal newly reachable from a
// registered route is an unasserted member of the set §3 crosses — the
// same shape route_reach_test.go asserts element by element on the real
// tree, exercised here over a route this test registers.
func TestNegativeControl3Goal043ANewLiteralReachableFromAProductRouteIsRefused(t *testing.T) {
	tree := newSyntheticTree(t)
	tree.write(t, filepath.Join("pkg", "svc", "service.go"), relayServiceSource("svc")+`
func (s *Service) SendGreetingRoute() error {
	greeting := "Bem-vindo de volta"
	msg := &waE2E.Message{
		ExtendedTextMessage: &waE2E.ExtendedTextMessage{
			Text: &greeting,
		},
	}
	return s.client.SendMessage("", msg)
}
`)
	tree.write(t, filepath.Join("pkg", "routes", "routes.go"),
		`package routes

import (
	"net/http"

	"`+syntheticModulePath+`/pkg/svc"
)

type Handlers struct {
	svc *svc.Service
}

func (h *Handlers) Assign(engine *http.ServeMux) {
	group := engine.Group("/notify")
	group.POST("/greet", h.svc.SendGreetingRoute)
}
`)

	enumeration := mustEnumerateSynthetic(t, tree)

	route, err := enumeration.RouteWithPath("/notify/greet")
	if err != nil {
		t.Fatalf("the registered route was not found: %v", err)
	}

	reach, err := enumeration.ProseReachFrom(route)
	if err != nil {
		t.Fatalf("the reach from the registered route could not be walked: %v", err)
	}

	// The permanent assertion of §3 (route_reach_test.go) declares the set
	// of literals reachable from a route element by element. On a tree
	// where nothing is declared for this route, every literal its reach
	// finds is an unasserted member — the failure the real assertion
	// raises the day a new one appears.
	declared := map[string]bool{}
	var refused []string
	for _, literal := range reach.Literals {
		position := syntheticPosition(t, tree, literal.File, literal.Line)
		if declared[position] {
			continue
		}
		refused = append(refused, literal.RouteMethod+" "+literal.RoutePath+" reaches "+position+
			" writing "+strconv.Quote(literal.Content)+" into "+literal.Field)
	}
	if len(refused) != 1 {
		t.Fatalf("expected exactly one refused literal reachable from the route, got %d: %v", len(refused), refused)
	}
	if !strings.Contains(refused[0], "POST /notify/greet") {
		t.Errorf("the refusal does not name the route it is reached from: %s", refused[0])
	}
	if !strings.Contains(refused[0], "Bem-vindo de volta") {
		t.Errorf("the refusal does not quote the literal: %s", refused[0])
	}
	if !strings.Contains(refused[0], "Text") {
		t.Errorf("the refusal does not name the carrier field: %s", refused[0])
	}
	t.Logf("control 3, final tree: %s", refused[0])
}

// TestNegativeControl4Goal043MovingARouteDoesNotChangeItsMatch is the Go
// half of control 4: the same route, moved to a file, a folder, a
// package and a handler type of another name, matches the same
// value-file entry with the same method and the same full path. No rule
// decides by name.
func TestNegativeControl4Goal043MovingARouteDoesNotChangeItsMatch(t *testing.T) {
	valueFileDir := t.TempDir()
	valueFile := filepath.Join(valueFileDir, "product-transport-routes.txt")
	writeTempFile(t, valueFile, "POST /send/text\n")
	entries, err := ReadProductTransportRoutesFile(valueFile)
	if err != nil {
		t.Fatalf("the value file could not be read: %v", err)
	}

	first := newSyntheticTree(t)
	first.write(t, filepath.Join("pkg", "routes", "routes.go"),
		syntheticRoutesFile("routes", "Handlers", "Send", "/send", "/text", "Text"))
	firstEnumeration := mustEnumerateSynthetic(t, first)
	firstReport, err := firstEnumeration.MatchProductTransportRoutes(entries)
	if err != nil {
		t.Fatalf("the entry did not match on the first tree: %v", err)
	}

	second := newSyntheticTree(t)
	second.write(t, filepath.Join("pkg", "endpoints", "wire.go"),
		syntheticRoutesFile("endpoints", "Router", "Dispatch", "/send", "/text", "SendMessage"))
	secondEnumeration := mustEnumerateSynthetic(t, second)
	secondReport, err := secondEnumeration.MatchProductTransportRoutes(entries)
	if err != nil {
		t.Fatalf("the entry did not match on the second tree: %v", err)
	}

	if len(firstReport.Matches) != 1 || len(secondReport.Matches) != 1 {
		t.Fatalf("expected exactly one match on each tree, got %d and %d",
			len(firstReport.Matches), len(secondReport.Matches))
	}
	before, after := firstReport.Matches[0].Route, secondReport.Matches[0].Route
	if before.Method != after.Method || before.FullPath != after.FullPath {
		t.Errorf("the match changed with the name: %s %s became %s %s",
			before.Method, before.FullPath, after.Method, after.FullPath)
	}
	t.Logf("control 4, Go side, final tree: %s %s matches identically in pkg/routes/routes.go and pkg/endpoints/wire.go",
		before.Method, before.FullPath)
}

// TestNoNegativeControlLeftAFileBehind checks the promise the controls
// make: every synthetic tree lives in a temporary directory, and the
// package directory itself holds nothing but Go sources.
func TestNoNegativeControlLeftAFileBehind(t *testing.T) {
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("could not read the package directory: %v", err)
	}
	var unexpected []string
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".go") {
			unexpected = append(unexpected, entry.Name())
		}
	}
	sort.Strings(unexpected)
	if len(unexpected) != 0 {
		t.Errorf("the package directory holds something that is not a Go source: %v", unexpected)
	}
}
