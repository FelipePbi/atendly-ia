package send_service

import (
	"context"
	"errors"
	"reflect"
	"sync"
	"testing"

	"go.mau.fi/whatsmeow/types"
)

type presenceRecorder struct {
	mu    sync.Mutex
	sent  []types.Presence
	failN int
}

func (r *presenceRecorder) send(_ context.Context, state types.Presence) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sent = append(r.sent, state)
	if r.failN > 0 {
		r.failN--
		return errors.New("socket closed")
	}
	return nil
}

func (r *presenceRecorder) states() []types.Presence {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]types.Presence(nil), r.sent...)
}

// D-205: o "digitando…" liga o online só durante a janela e sempre volta para
// indisponível, senão o celular do dono para de receber notificação.
func TestTypingPresence_AvailableOnlyWhileTyping(t *testing.T) {
	tp := newTypingPresence()
	rec := &presenceRecorder{}

	release := tp.hold("inst", false, rec.send, nil)
	if got := rec.states(); !reflect.DeepEqual(got, []types.Presence{types.PresenceAvailable}) {
		t.Fatalf("after hold: got %v", got)
	}

	release()
	release() // idempotente: não manda de novo nem desconta outra janela

	want := []types.Presence{types.PresenceAvailable, types.PresenceUnavailable}
	if got := rec.states(); !reflect.DeepEqual(got, want) {
		t.Fatalf("after release: got %v, want %v", got, want)
	}
}

func TestTypingPresence_OverlappingWindowsShareOnePair(t *testing.T) {
	tp := newTypingPresence()
	rec := &presenceRecorder{}

	a := tp.hold("inst", false, rec.send, nil)
	b := tp.hold("inst", false, rec.send, nil)
	a()
	if got := rec.states(); !reflect.DeepEqual(got, []types.Presence{types.PresenceAvailable}) {
		t.Fatalf("still typing in another chat, must stay available: got %v", got)
	}
	b()

	want := []types.Presence{types.PresenceAvailable, types.PresenceUnavailable}
	if got := rec.states(); !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestTypingPresence_InstancesAreIndependent(t *testing.T) {
	tp := newTypingPresence()
	recA, recB := &presenceRecorder{}, &presenceRecorder{}

	a := tp.hold("a", false, recA.send, nil)
	b := tp.hold("b", false, recB.send, nil)
	a()

	if got := recA.states(); !reflect.DeepEqual(got, []types.Presence{types.PresenceAvailable, types.PresenceUnavailable}) {
		t.Fatalf("instance a: got %v", got)
	}
	if got := recB.states(); !reflect.DeepEqual(got, []types.Presence{types.PresenceAvailable}) {
		t.Fatalf("instance b: got %v", got)
	}
	b()
}

func TestTypingPresence_AlwaysOnlineIsUntouched(t *testing.T) {
	tp := newTypingPresence()
	rec := &presenceRecorder{}

	tp.hold("inst", true, rec.send, nil)()

	if got := rec.states(); len(got) != 0 {
		t.Fatalf("alwaysOnline instance must not get presence changes, got %v", got)
	}
}

func TestTypingPresence_FailedAvailableStillEndsUnavailable(t *testing.T) {
	tp := newTypingPresence()
	rec := &presenceRecorder{failN: 1}
	var failed []types.Presence

	tp.hold("inst", false, rec.send, func(p types.Presence, _ error) { failed = append(failed, p) })()

	if !reflect.DeepEqual(failed, []types.Presence{types.PresenceAvailable}) {
		t.Fatalf("expected the available failure to be reported, got %v", failed)
	}
	want := []types.Presence{types.PresenceAvailable, types.PresenceUnavailable}
	if got := rec.states(); !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestTypingPresence_ConcurrentHoldsEndUnavailable(t *testing.T) {
	tp := newTypingPresence()
	rec := &presenceRecorder{}

	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			tp.hold("inst", false, rec.send, nil)()
		}()
	}
	wg.Wait()

	got := rec.states()
	if len(got) == 0 || got[len(got)-1] != types.PresenceUnavailable {
		t.Fatalf("last presence must be unavailable, got %v", got)
	}
	if len(tp.active) != 0 {
		t.Fatalf("no window should remain open, got %v", tp.active)
	}
}
