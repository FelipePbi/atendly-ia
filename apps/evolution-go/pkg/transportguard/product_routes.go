package transportguard

import (
	"os"
	"strconv"
	"strings"
)

// ProductTransportRoutesRelPathFromModule is the value file of routes the
// two product trees (ai-orchestrator/src and bff/src) reach in this
// service, relative to the evolution-go module root. It is read, never
// parsed as TypeScript: the file already spells METHOD and PATH.
const ProductTransportRoutesRelPathFromModule = "../ai-orchestrator/tests/support/product-transport-routes.txt"

// ProductRouteEntry is one route a product tree reaches, read from the
// value file: a method, a path where a computed segment is written "{}",
// and the line it was read from.
type ProductRouteEntry struct {
	Method string
	Path   string
	Line   int
}

// ReadProductTransportRoutesFile reads path as "METHOD PATH" lines, one
// route per line, a line starting with "#" is a comment and a blank line
// is ignored. A missing file, and a file with no entries once comments
// and blank lines are dropped, both fail: the read is fail-closed, so a
// file that disappears or empties out stops the suite instead of quietly
// matching nothing.
func ReadProductTransportRoutesFile(path string) ([]ProductRouteEntry, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, &GuardError{
			Location: path,
			Message:  "the product transport routes file could not be read: " + err.Error(),
		}
	}
	var entries []ProductRouteEntry
	for i, line := range strings.Split(string(content), "\n") {
		lineNumber := i + 1
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		fields := strings.Fields(trimmed)
		if len(fields) != 2 {
			return nil, &GuardError{
				Location: path + ":" + strconv.Itoa(lineNumber),
				Message:  "does not have the form \"METHOD PATH\": " + strconv.Quote(trimmed),
			}
		}
		entries = append(entries, ProductRouteEntry{Method: fields[0], Path: fields[1], Line: lineNumber})
	}
	if len(entries) == 0 {
		return nil, &GuardError{
			Location: path,
			Message:  "sets no route; the product transport routes file is empty",
		}
	}
	return entries, nil
}

// routePathSegmentsMatch reports whether entryPath — where a segment the
// product computes at call time is written "{}" — matches fullPath, a
// registered route's full path, segment by segment: a literal segment
// must be spelled identically on both sides, and "{}" matches only a
// route path parameter, which is the segment the router library spells
// with a leading ":". Comparing the two paths as whole strings would let
// a "{}" stand for a literal segment it was never meant to hide, and
// would fail every entry that names a route registered inside a group,
// since the group prefix is assembled, not spelled at the call site.
func routePathSegmentsMatch(entryPath, fullPath string) bool {
	entrySegments := strings.Split(strings.Trim(entryPath, "/"), "/")
	routeSegments := strings.Split(strings.Trim(fullPath, "/"), "/")
	if len(entrySegments) != len(routeSegments) {
		return false
	}
	for i, segment := range entrySegments {
		if segment == "{}" {
			if !strings.HasPrefix(routeSegments[i], ":") {
				return false
			}
			continue
		}
		if segment != routeSegments[i] {
			return false
		}
	}
	return true
}

// ProductRouteMatch pairs one entry from the value file with the single
// registered route it matched.
type ProductRouteMatch struct {
	Entry ProductRouteEntry
	Route RegisteredRoute
}

// ProductRouteMatchReport is the result of matching every entry of the
// value file against every route this tree registers.
type ProductRouteMatchReport struct {
	// Matches holds one pair per entry that matched exactly one
	// registered route.
	Matches []ProductRouteMatch
	// Unreached holds the routes this tree registers that no entry of
	// the value file matched. A route ending up here is not a failure:
	// the product not calling a route this service exposes is not a
	// boundary crossing to prove.
	Unreached []RegisteredRoute
}

// Report renders the routes this tree registers that no entry of the
// value file reaches, with their count.
func (r ProductRouteMatchReport) Report() string {
	var b strings.Builder
	b.WriteString("registered routes not reached by the product transport routes file: " +
		strconv.Itoa(len(r.Unreached)) + "\n")
	for _, route := range r.Unreached {
		b.WriteString("  " + route.Method + " " + route.FullPath + " at " + route.Position() + "\n")
	}
	return b.String()
}

// MatchProductTransportRoutes matches every entry against the routes
// this enumeration registered, comparing method exactly and path segment
// by segment, with "{}" matching a route path parameter. An entry that
// matches no registered route, or more than one, fails with the entry
// printed. A registered route no entry reaches is not a failure: it is
// counted in the returned report instead.
func (e *Enumeration) MatchProductTransportRoutes(entries []ProductRouteEntry) (ProductRouteMatchReport, error) {
	var report ProductRouteMatchReport
	reached := make([]bool, len(e.Routes))
	var problems []string
	for _, entry := range entries {
		var matches []RegisteredRoute
		var matchAt []int
		for i, route := range e.Routes {
			if route.Method != entry.Method {
				continue
			}
			if !routePathSegmentsMatch(entry.Path, route.FullPath) {
				continue
			}
			matches = append(matches, route)
			matchAt = append(matchAt, i)
		}
		switch len(matches) {
		case 1:
			report.Matches = append(report.Matches, ProductRouteMatch{Entry: entry, Route: matches[0]})
			reached[matchAt[0]] = true
		case 0:
			problems = append(problems, "line "+strconv.Itoa(entry.Line)+": "+entry.Method+" "+entry.Path+
				" matches no registered route")
		default:
			var at []string
			for _, match := range matches {
				at = append(at, match.Position())
			}
			problems = append(problems, "line "+strconv.Itoa(entry.Line)+": "+entry.Method+" "+entry.Path+
				" matches "+strconv.Itoa(len(matches))+" registered routes: "+strings.Join(at, ", "))
		}
	}
	for i, route := range e.Routes {
		if !reached[i] {
			report.Unreached = append(report.Unreached, route)
		}
	}
	if len(problems) > 0 {
		return report, &GuardError{
			Location: "product transport routes file",
			Message: strconv.Itoa(len(problems)) + " of " + strconv.Itoa(len(entries)) +
				" entries did not match exactly one registered route:\n  " + strings.Join(problems, "\n  "),
		}
	}
	return report, nil
}
