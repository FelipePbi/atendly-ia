package message_handler

import (
	"github.com/gin-gonic/gin"

	instance_model "github.com/EvolutionAPI/evolution-go/pkg/instance/model"
)

// authenticatedInstance lê a instância que o middleware Auth colocou no
// contexto sem usar MustGet, de modo que contexto ausente, tipo inesperado,
// ponteiro nil ou instância sem Id sejam tratados como ausência de sujeito
// autenticado em vez de panic ou de 500.
func authenticatedInstance(ctx *gin.Context) (*instance_model.Instance, bool) {
	value, exists := ctx.Get("instance")
	if !exists {
		return nil, false
	}

	instance, ok := value.(*instance_model.Instance)
	if !ok || instance == nil || instance.Id == "" {
		return nil, false
	}

	return instance, true
}
