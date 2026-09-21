// Package transportguard reads the evolution-go production tree and the
// waE2E proto definitions to support Goal042's transport-layer text guard.
// It is test support only: nothing under cmd/evolution-go imports it.
package transportguard

import (
	"os"
	"path/filepath"
	"sort"
)

// excludedTreeDirs are subtrees never walked when discovering production
// Go sources: vendorized whatsmeow code is out of scope for this guard.
var excludedTreeDirs = map[string]bool{
	"whatsmeow-lib": true,
}

// DiscoverProductionGoFiles walks the "pkg" and "cmd" trees under
// evolutionGoRoot and returns every production .go file: no "_test.go"
// file and nothing under an excluded directory (whatsmeow-lib). The
// returned paths are absolute and sorted, computed from the filesystem on
// every call — never written by hand.
func DiscoverProductionGoFiles(evolutionGoRoot string) ([]string, error) {
	var files []string
	for _, subtree := range []string{"pkg", "cmd"} {
		root := filepath.Join(evolutionGoRoot, subtree)
		err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() {
				if excludedTreeDirs[d.Name()] {
					return filepath.SkipDir
				}
				return nil
			}
			if filepath.Ext(path) != ".go" {
				return nil
			}
			if hasTestSuffix(path) {
				return nil
			}
			abs, err := filepath.Abs(path)
			if err != nil {
				return err
			}
			files = append(files, abs)
			return nil
		})
		if err != nil {
			return nil, err
		}
	}
	sort.Strings(files)
	return files, nil
}

func hasTestSuffix(path string) bool {
	base := filepath.Base(path)
	const suffix = "_test.go"
	if len(base) < len(suffix) {
		return false
	}
	return base[len(base)-len(suffix):] == suffix
}
