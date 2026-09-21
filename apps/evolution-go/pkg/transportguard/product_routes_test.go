package transportguard

import (
	"path/filepath"
	"strings"
	"testing"
)

// productTransportRoutesPathFromPackage is the value file of routes the
// product trees reach, resolved from this package directory.
func productTransportRoutesPathFromPackage() string {
	return filepath.Join(evolutionGoRootFromPackage, ProductTransportRoutesRelPathFromModule)
}

// TestEveryProductTransportRouteEntryMatchesExactlyOneRegisteredRoute is
// the Go half of the boundary being crossed everywhere the product
// reaches: every entry of the value file (Goal043 / WU-02) matches
// exactly one route this tree registers, method and path, segment by
// segment. Routes this tree registers that no entry reaches are counted
// in the report, not refused.
func TestEveryProductTransportRouteEntryMatchesExactlyOneRegisteredRoute(t *testing.T) {
	enumeration := enumerateRealTree(t)

	entries, err := ReadProductTransportRoutesFile(productTransportRoutesPathFromPackage())
	if err != nil {
		t.Fatalf("the product transport routes file could not be read: %v", err)
	}
	if len(entries) == 0 {
		t.Fatal("no entry was read from the product transport routes file")
	}

	report, err := enumeration.MatchProductTransportRoutes(entries)
	if err != nil {
		t.Fatalf("an entry did not match exactly one registered route: %v", err)
	}
	if len(report.Matches) != len(entries) {
		t.Fatalf("expected %d matched entries, got %d", len(entries), len(report.Matches))
	}
	for _, match := range report.Matches {
		t.Logf("entry %s %s matched route %s registered at %s",
			match.Entry.Method, match.Entry.Path, match.Route.FullPath,
			positionRelativeToModuleRoot(t, match.Route.File, match.Route.Line))
	}

	if len(report.Unreached) == 0 {
		t.Fatal("expected at least one registered route the value file does not reach, so the count is exercised")
	}
	t.Logf("%s", report.Report())
}

// TestAMissingOrEmptyProductTransportRoutesFileFailsInsteadOfSkipping is
// the fail-closed half of the read: a value file that is missing, or
// that sets no route once comments and blank lines are dropped, fails
// rather than being treated as zero entries to match.
func TestAMissingOrEmptyProductTransportRoutesFileFailsInsteadOfSkipping(t *testing.T) {
	dir := t.TempDir()

	missing := filepath.Join(dir, "does-not-exist.txt")
	if _, err := ReadProductTransportRoutesFile(missing); err == nil {
		t.Fatal("a missing product transport routes file was read without complaint")
	}

	empty := filepath.Join(dir, "empty.txt")
	writeTempFile(t, empty, "# only a comment\n\n")
	if _, err := ReadProductTransportRoutesFile(empty); err == nil {
		t.Fatal("a product transport routes file with no entries was read without complaint")
	} else if !strings.Contains(err.Error(), "empty") {
		t.Errorf("the failure does not say the file is empty: %v", err)
	}
}

// TestAProductRouteEntryWithNoMatchingRegisteredRouteFailsWithTheEntry
// and the sibling test below are the segment-matching half of the
// criterion, exercised against a hand-built set of registered routes
// rather than the real tree, so the two failure shapes — no match, and
// more than one — are each reached directly.
func TestAProductRouteEntryWithNoMatchingRegisteredRouteFailsWithTheEntry(t *testing.T) {
	enumeration := &Enumeration{Routes: []RegisteredRoute{
		{Method: "POST", FullPath: "/send/text"},
	}}
	entries := []ProductRouteEntry{{Method: "POST", Path: "/send/nowhere", Line: 1}}

	_, err := enumeration.MatchProductTransportRoutes(entries)
	if err == nil {
		t.Fatal("an entry with no matching registered route was accepted")
	}
	if !strings.Contains(err.Error(), "POST /send/nowhere") {
		t.Errorf("the failure does not print the offending entry: %v", err)
	}
}

func TestAProductRouteEntryMatchingMoreThanOneRegisteredRouteFailsWithTheEntry(t *testing.T) {
	enumeration := &Enumeration{Routes: []RegisteredRoute{
		{Method: "GET", FullPath: "/instance/info/:instanceId", File: "a.go", Line: 1},
		{Method: "GET", FullPath: "/instance/info/:otherId", File: "b.go", Line: 2},
	}}
	entries := []ProductRouteEntry{{Method: "GET", Path: "/instance/info/{}", Line: 1}}

	_, err := enumeration.MatchProductTransportRoutes(entries)
	if err == nil {
		t.Fatal("an entry matching two registered routes was accepted")
	}
	if !strings.Contains(err.Error(), "GET /instance/info/{}") {
		t.Errorf("the failure does not print the offending entry: %v", err)
	}
	if !strings.Contains(err.Error(), "a.go:1") || !strings.Contains(err.Error(), "b.go:2") {
		t.Errorf("the failure does not name both registrations that share the path: %v", err)
	}
}

// TestRoutePathSegmentsMatchCasesTheHoleAgainstAParameterSegmentOnly is
// the unit-level check that "{}" stands for a route path parameter and
// nothing else: it never matches a literal segment, and it never lets a
// whole-string comparison stand in for the segment-by-segment one.
func TestRoutePathSegmentsMatchCasesTheHoleAgainstAParameterSegmentOnly(t *testing.T) {
	cases := []struct {
		name      string
		entryPath string
		fullPath  string
		want      bool
	}{
		{"literal route, no hole", "/send/text", "/send/text", true},
		{"hole against a route parameter", "/instance/delete/{}", "/instance/delete/:instanceId", true},
		{"hole against a literal segment is refused", "/instance/delete/{}", "/instance/delete/logout", false},
		{"different segment count is refused", "/instance/delete/{}", "/instance/delete", false},
		{"whole-string spelling difference is refused even with equal length", "/instance/delete/{}", "/instance/logout/:instanceId", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := routePathSegmentsMatch(c.entryPath, c.fullPath); got != c.want {
				t.Errorf("routePathSegmentsMatch(%q, %q) = %v, want %v", c.entryPath, c.fullPath, got, c.want)
			}
		})
	}
}
