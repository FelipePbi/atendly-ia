package transportguard

import (
	"os"
	"strconv"
	"strings"
)

// EnvExampleRelPathFromModule is the example environment file of the
// service on the other side of the boundary, relative to the
// evolution-go module root. The boundary is crossed by a value, and this
// file is where the Go side reads that value from: it does not parse
// TypeScript, it reads KEY=VALUE.
const EnvExampleRelPathFromModule = "../ai-orchestrator/.env.example"

// BoundaryPathEnvKey is the key whose value names the path the product
// calls to hand text to this transport service.
const BoundaryPathEnvKey = "EVOLUTION_SEND_TEXT_PATH"

// ReadEnvFileValue reads path as KEY=VALUE lines and returns the value of
// key. A missing file, and a file that does not set the key, both fail:
// the check is fail-closed, so a key that disappears stops the suite
// instead of quietly skipping the assertion that depends on it.
func ReadEnvFileValue(path, key string) (string, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	for _, line := range strings.Split(string(content), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		name, value, found := strings.Cut(trimmed, "=")
		if !found || strings.TrimSpace(name) != key {
			continue
		}
		return unquoteEnvValue(strings.TrimSpace(value)), nil
	}
	return "", &GuardError{
		Location: path,
		Message:  "does not set " + key + ", so the value that crosses the service boundary cannot be read",
	}
}

// unquoteEnvValue drops the quoting an environment file may wrap a value
// in, leaving the value itself.
func unquoteEnvValue(value string) string {
	if len(value) < 2 {
		return value
	}
	first, last := value[0], value[len(value)-1]
	if first != last || (first != '"' && first != '\'') {
		return value
	}
	if unquoted, err := strconv.Unquote(value); err == nil {
		return unquoted
	}
	return value[1 : len(value)-1]
}
