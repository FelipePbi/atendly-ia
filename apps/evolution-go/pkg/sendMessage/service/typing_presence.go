package send_service

import (
	"context"
	"sync"

	"go.mau.fi/whatsmeow/types"
)

// typingPresence liga o "online" do aparelho vinculado só enquanto ele mostra
// "digitando…" (Avenly D-205).
//
// O "digitando…" é estado de quem está disponível, e aparelho
// vinculado disponível faz o celular do dono parar de receber notificação.
// Então: disponível → digitando → pausa → envia → indisponível. Envios
// simultâneos da mesma instância (conversas diferentes) dividem a mesma
// janela: o primeiro liga, o último desliga. Instância com alwaysOnline já
// está online e não é tocada.
type typingPresence struct {
	mu     sync.Mutex
	active map[string]int
}

type presenceSender func(ctx context.Context, state types.Presence) error

func newTypingPresence() *typingPresence {
	return &typingPresence{active: map[string]int{}}
}

// hold marca a instância como disponível (se for a primeira digitação em
// andamento) e devolve a função que desfaz isso. A função é idempotente.
// Falha ao mandar a presença não impede o envio: no pior caso o "digitando…"
// não aparece, ou a conta fica online até a próxima digitação.
func (t *typingPresence) hold(instanceID string, alwaysOnline bool, send presenceSender, onErr func(types.Presence, error)) func() {
	if alwaysOnline {
		return func() {}
	}

	// A presença sai com o lock seguro, para a última mensagem na rede ser
	// sempre a do último a sair.
	t.mu.Lock()
	t.active[instanceID]++
	if t.active[instanceID] == 1 {
		if err := send(context.Background(), types.PresenceAvailable); err != nil && onErr != nil {
			onErr(types.PresenceAvailable, err)
		}
	}
	t.mu.Unlock()

	var once sync.Once
	return func() {
		once.Do(func() {
			t.mu.Lock()
			defer t.mu.Unlock()
			t.active[instanceID]--
			if t.active[instanceID] > 0 {
				return
			}
			delete(t.active, instanceID)
			if err := send(context.Background(), types.PresenceUnavailable); err != nil && onErr != nil {
				onErr(types.PresenceUnavailable, err)
			}
		})
	}
}
