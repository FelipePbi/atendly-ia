package transportguard

import (
	"path/filepath"
	"strings"
	"testing"
)

// envExamplePathFromPackage is the example environment file of the
// service on the other side of the boundary, resolved from this package
// directory.
func envExamplePathFromPackage() string {
	return filepath.Join(evolutionGoRootFromPackage, EnvExampleRelPathFromModule)
}

// TestEveryRegisteredRoutePathIsComputedFromTheGroupAndTheRegistration is
// criterion 7: the full path of a route is the group prefix followed by
// the registered path, both read from the syntax tree. Nothing here
// spells a path out, and a registration whose prefix were dropped would
// show up as a path that does not start with its own group.
func TestEveryRegisteredRoutePathIsComputedFromTheGroupAndTheRegistration(t *testing.T) {
	enumeration := enumerateRealTree(t)

	if len(enumeration.Routes) == 0 {
		t.Fatal("no route registration was found; the route reader is not reading the tree")
	}

	grouped := 0
	for _, route := range enumeration.Routes {
		if route.FullPath != route.GroupPrefix+route.RegisteredPath {
			t.Errorf("route at %s has full path %q, which is not its group prefix %q followed by %q",
				positionRelativeToModuleRoot(t, route.File, route.Line), route.FullPath, route.GroupPrefix, route.RegisteredPath)
		}
		if !strings.HasPrefix(route.FullPath, "/") {
			t.Errorf("route at %s has a full path that is not rooted: %q",
				positionRelativeToModuleRoot(t, route.File, route.Line), route.FullPath)
		}
		if route.Method == "" {
			t.Errorf("route %s at %s was registered by no named call",
				route.FullPath, positionRelativeToModuleRoot(t, route.File, route.Line))
		}
		if route.GroupPrefix != "" {
			grouped++
		}
	}
	if grouped == 0 {
		t.Fatal("no route carries a group prefix, so the prefix half of the computation is not being exercised")
	}
}

// TestTheBoundaryValueIsARegisteredRouteThatRelays is criterion 8: the
// value the product uses to cross the service boundary is read from the
// example environment file, it is a route this tree registers, and the
// chain from that route — registration, handler, service — reaches a
// site that puts the received text on the wire.
func TestTheBoundaryValueIsARegisteredRouteThatRelays(t *testing.T) {
	enumeration := enumerateRealTree(t)

	path, err := ReadEnvFileValue(envExamplePathFromPackage(), BoundaryPathEnvKey)
	if err != nil {
		t.Fatalf("the boundary value could not be read: %v", err)
	}
	if path == "" {
		t.Fatal("the boundary value is empty")
	}

	route, err := enumeration.RouteWithPath(path)
	if err != nil {
		t.Fatalf("the boundary value %q is not a registered route: %v", path, err)
	}
	t.Logf("boundary value %q is registered at %s by %s, handled by %s.%s declared at %s",
		path, positionRelativeToModuleRoot(t, route.File, route.Line), route.Method,
		route.HandlerType, route.HandlerName,
		positionRelativeToModuleRoot(t, route.HandlerFile, route.HandlerLine))

	chain, err := enumeration.ChainFrom(route)
	if err != nil {
		t.Fatalf("the chain from route %q could not be followed: %v", path, err)
	}
	relaying := chain.RelaySites()
	if len(relaying) == 0 {
		for _, site := range chain.Sites {
			t.Logf("chain site %s writes %s%v with category %s",
				positionRelativeToModuleRoot(t, site.File, site.Line), site.MessageType, site.CarrierFields, site.Category)
		}
		t.Fatalf("the chain from route %q reaches %d carrier sites and none of them has every field coming from the request body",
			path, len(chain.Sites))
	}
	for _, site := range relaying {
		t.Logf("relay site %s writes %s%v",
			positionRelativeToModuleRoot(t, site.File, site.Line), site.MessageType, site.CarrierFields)
	}
}

// TestAMissingBoundaryKeyFailsInsteadOfSkipping is the fail-closed half
// of criterion 8, exercised against a temporary file rather than by
// touching the real one.
func TestAMissingBoundaryKeyFailsInsteadOfSkipping(t *testing.T) {
	dir := t.TempDir()
	withoutKey := filepath.Join(dir, "without-key.env")
	writeTempFile(t, withoutKey, "SOME_OTHER_KEY=/elsewhere\n")

	if _, err := ReadEnvFileValue(withoutKey, BoundaryPathEnvKey); err == nil {
		t.Fatal("an environment file without the boundary key was read without complaint")
	} else if !strings.Contains(err.Error(), BoundaryPathEnvKey) {
		t.Errorf("the failure does not name the missing key: %v", err)
	}

	missingFile := filepath.Join(dir, "does-not-exist.env")
	if _, err := ReadEnvFileValue(missingFile, BoundaryPathEnvKey); err == nil {
		t.Fatal("a missing environment file was read without complaint")
	}
}
