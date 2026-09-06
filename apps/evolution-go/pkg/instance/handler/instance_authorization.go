package instance_handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	instance_model "github.com/EvolutionAPI/evolution-go/pkg/instance/model"
)

// authenticatedInstance lê a instância que o middleware Auth colocou no contexto
// sem usar MustGet, de modo que contexto ausente, tipo inesperado, ponteiro nil
// ou instância sem Id sejam tratados como ausência de sujeito autenticado em vez
// de panic.
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

// authorizeInstanceTarget autoriza o alvo informado na URL contra a instância
// autenticada e devolve o Id validado do sujeito. Deve ser chamado antes de
// qualquer leitura de body ou chamada de service, porque a recusa não pode
// depender do alvo: 401 quando não há contexto autenticado válido e 403 quando o
// alvo é outra instância, ambos com erro genérico e sem consultar o alvo.
func authorizeInstanceTarget(ctx *gin.Context) (string, bool) {
	instance, ok := authenticatedInstance(ctx)
	if !ok {
		ctx.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "not authorized"})
		return "", false
	}

	if ctx.Param("instanceId") != instance.Id {
		ctx.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return "", false
	}

	return instance.Id, true
}
