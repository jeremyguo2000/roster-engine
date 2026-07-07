{{- define "roster-engine.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{- define "roster-engine.fullname" -}}
{{- if contains .Chart.Name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end }}

{{- define "roster-engine.labels" -}}
app.kubernetes.io/name: {{ include "roster-engine.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end }}

{{- define "roster-engine.selectorLabels" -}}
app.kubernetes.io/name: {{ include "roster-engine.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "roster-engine.backendImage" -}}
{{- if .Values.image.registry -}}
{{- printf "%s/%s:%s" .Values.image.registry .Values.image.backendRepository .Values.image.tag -}}
{{- else -}}
{{- printf "%s:%s" .Values.image.backendRepository .Values.image.tag -}}
{{- end -}}
{{- end }}

{{- define "roster-engine.frontendImage" -}}
{{- if .Values.image.registry -}}
{{- printf "%s/%s:%s" .Values.image.registry .Values.image.frontendRepository .Values.image.tag -}}
{{- else -}}
{{- printf "%s:%s" .Values.image.frontendRepository .Values.image.tag -}}
{{- end -}}
{{- end }}

{{/* Hostnames of the in-cluster services */}}
{{- define "roster-engine.postgresHost" -}}
{{ include "roster-engine.fullname" . }}-postgres
{{- end }}

{{- define "roster-engine.redisHost" -}}
{{ include "roster-engine.fullname" . }}-redis
{{- end }}

{{- define "roster-engine.backendHost" -}}
{{ include "roster-engine.fullname" . }}-backend
{{- end }}

{{- define "roster-engine.redisUrl" -}}
redis://{{ include "roster-engine.redisHost" . }}:6379/0
{{- end }}

{{/* Env vars shared by the backend and the celery worker */}}
{{- define "roster-engine.appEnv" -}}
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: {{ include "roster-engine.fullname" . }}
      key: DATABASE_URL
- name: CELERY_RESULT_BACKEND
  valueFrom:
    secretKeyRef:
      name: {{ include "roster-engine.fullname" . }}
      key: CELERY_RESULT_BACKEND
- name: SECRET_KEY
  valueFrom:
    secretKeyRef:
      name: {{ include "roster-engine.fullname" . }}
      key: SECRET_KEY
- name: REDIS_URL
  value: {{ include "roster-engine.redisUrl" . | quote }}
- name: CELERY_BROKER_URL
  value: {{ include "roster-engine.redisUrl" . | quote }}
- name: ACCESS_TOKEN_EXPIRE_MINUTES
  value: {{ .Values.auth.accessTokenExpireMinutes | quote }}
{{- end }}

{{- define "roster-engine.imagePullSecrets" -}}
{{- with .Values.image.pullSecrets }}
imagePullSecrets:
{{ toYaml . }}
{{- end }}
{{- end }}
