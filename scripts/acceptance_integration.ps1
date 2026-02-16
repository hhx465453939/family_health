param(
  [string]$BaseUrl = "http://localhost:8000",
  [string]$FrontendUrl = "http://localhost:5173",
  [string]$OwnerUsername = "owner",
  [string]$OwnerPassword = "OwnerPass123",
  [string]$OwnerDisplayName = "Owner",
  [switch]$SkipFrontendCheck,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )
  if (-not $Condition) {
    throw "ASSERT FAILED: $Message"
  }
}

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Path,
    [object]$Body,
    [hashtable]$Headers
  )

  $url = "$BaseUrl$Path"
  if ($DryRun) {
    Write-Host "[DRY-RUN] $Method $url"
    switch ($Path) {
      "/api/v1/auth/login" {
        return @{
          code = 0
          data = @{
            access_token = "dry-token"
            refresh_token = "dry-refresh"
            role = "owner"
            user_id = "dry-user"
          }
          message = "ok"
          trace_id = "dry-run"
        }
      }
      "/api/v1/model-catalog" {
        return @{
          code = 0
          data = @{
            items = @(
              @{ id = "dry-llm"; model_type = "llm"; model_name = "dry-model" }
            )
          }
          message = "ok"
          trace_id = "dry-run"
        }
      }
      "/api/v1/agent/qa" {
        return @{
          code = 0
          data = @{
            context = @{
              attachment_chunks = 1
            }
          }
          message = "ok"
          trace_id = "dry-run"
        }
      }
      "/api/v1/retrieval/query" {
        return @{
          code = 0
          data = @{
            items = @(
              @{ text = "dry-result" }
            )
          }
          message = "ok"
          trace_id = "dry-run"
        }
      }
      { $_ -like "/api/v1/exports/jobs/*" } {
        return @{
          code = 0
          data = @{
            id = "dry-export"
            status = "done"
            items = @()
          }
          message = "ok"
          trace_id = "dry-run"
        }
      }
      default {
        return @{ code = 0; data = @{ id = "dry-id"; status = "done"; items = @() }; message = "ok"; trace_id = "dry-run" }
      }
    }
  }

  $params = @{
    Method = $Method
    Uri = $url
    Headers = $Headers
  }

  if ($null -ne $Body) {
    $params["ContentType"] = "application/json"
    $params["Body"] = ($Body | ConvertTo-Json -Depth 10)
  }

  try {
    return Invoke-RestMethod @params
  } catch {
    if ($_.Exception.Response -and $_.ErrorDetails.Message) {
      $errBody = $_.ErrorDetails.Message | ConvertFrom-Json
      return $errBody
    }
    throw
  }
}

function Invoke-ApiMultipart {
  param(
    [string]$Path,
    [hashtable]$Headers,
    [string]$FilePath
  )

  $url = "$BaseUrl$Path"
  if ($DryRun) {
    Write-Host "[DRY-RUN] POST $url (multipart)"
    return @{ code = 0; data = @{ id = "dry-attachment" }; message = "ok"; trace_id = "dry-run" }
  }

  return Invoke-RestMethod -Method Post -Uri $url -Headers $Headers -Form @{ file = Get-Item $FilePath }
}

function Require-EnvelopeOk {
  param(
    [object]$Response,
    [string]$Scene
  )
  Assert-True ($null -ne $Response) "$Scene 无响应"
  Assert-True ($Response.code -eq 0) "$Scene 失败: $($Response.message) (code=$($Response.code))"
}

$runId = Get-Date -Format "yyyyMMddHHmmss"
$phonePattern = "13800138000"

Write-Step "检查后端健康状态"
if (-not $DryRun) {
  $health = Invoke-RestMethod -Method Get -Uri "$BaseUrl/health"
  Assert-True ($health.status -eq "ok") "后端 /health 不可用"
}

if (-not $SkipFrontendCheck) {
  Write-Step "检查前端可访问性"
  if (-not $DryRun) {
    $frontendResp = Invoke-WebRequest -Method Get -Uri $FrontendUrl -UseBasicParsing
    Assert-True ($frontendResp.StatusCode -ge 200 -and $frontendResp.StatusCode -lt 500) "前端地址不可访问: $FrontendUrl"
  }
}

Write-Step "初始化 Owner（若已初始化则自动跳过）"
$bootstrapResp = Invoke-Api -Method "Post" -Path "/api/v1/auth/bootstrap-owner" -Body @{
  username = $OwnerUsername
  password = $OwnerPassword
  display_name = $OwnerDisplayName
} -Headers @{}
if ($bootstrapResp.code -eq 0) {
  Write-Host "Owner 初始化成功"
} elseif ($bootstrapResp.message -match "Owner already initialized") {
  Write-Host "Owner 已存在，继续登录"
} else {
  throw "Owner 初始化失败: $($bootstrapResp.message)"
}

Write-Step "登录获取 token"
$loginResp = Invoke-Api -Method "Post" -Path "/api/v1/auth/login" -Body @{
  username = $OwnerUsername
  password = $OwnerPassword
} -Headers @{}
Require-EnvelopeOk -Response $loginResp -Scene "登录"
$token = $loginResp.data.access_token
Assert-True (-not [string]::IsNullOrWhiteSpace($token)) "未拿到 access_token"
$authHeaders = @{ Authorization = "Bearer $token" }

Write-Step "创建 Provider 并刷新模型"
$providerResp = Invoke-Api -Method "Post" -Path "/api/v1/model-providers" -Body @{
  provider_name = "gemini"
  base_url = "https://example.local/gemini"
  api_key = "demo-key-$runId"
  enabled = $true
} -Headers $authHeaders
Require-EnvelopeOk -Response $providerResp -Scene "创建 Provider"
$providerId = $providerResp.data.id

$refreshResp = Invoke-Api -Method "Post" -Path "/api/v1/model-providers/$providerId/refresh-models" -Body @{
  manual_models = @("gemini-custom-$runId")
} -Headers $authHeaders
Require-EnvelopeOk -Response $refreshResp -Scene "刷新模型目录"

$catalogResp = Invoke-Api -Method "Get" -Path "/api/v1/model-catalog" -Body $null -Headers $authHeaders
Require-EnvelopeOk -Response $catalogResp -Scene "查询模型目录"
$llmModel = $catalogResp.data.items | Where-Object { $_.model_type -eq "llm" } | Select-Object -First 1
Assert-True ($null -ne $llmModel) "模型目录中未找到 llm model"

Write-Step "创建 Runtime Profile"
$profileResp = Invoke-Api -Method "Post" -Path "/api/v1/runtime-profiles" -Body @{
  name = "profile-$runId"
  llm_model_id = $llmModel.id
  embedding_model_id = $null
  reranker_model_id = $null
  params = @{ temperature = 0.2; reasoning_budget = 64 }
  is_default = $true
} -Headers $authHeaders
Require-EnvelopeOk -Response $profileResp -Scene "创建 Runtime Profile"

Write-Step "创建 MCP Server 并绑定 QA"
$mcpResp = Invoke-Api -Method "Post" -Path "/api/v1/mcp/servers" -Body @{
  name = "tool-$runId"
  endpoint = "mock://tool-$runId"
  auth_type = "none"
  enabled = $true
  timeout_ms = 8000
} -Headers $authHeaders
Require-EnvelopeOk -Response $mcpResp -Scene "创建 MCP Server"
$mcpId = $mcpResp.data.id

$bindResp = Invoke-Api -Method "Put" -Path "/api/v1/mcp/bindings/qa" -Body @{
  mcp_server_ids = @($mcpId)
} -Headers $authHeaders
Require-EnvelopeOk -Response $bindResp -Scene "绑定 QA MCP"

Write-Step "新增脱敏规则并创建会话"
$ruleResp = Invoke-Api -Method "Post" -Path "/api/v1/desensitization/rules" -Body @{
  member_scope = "global"
  rule_type = "literal"
  pattern = $phonePattern
  replacement_token = "[PHONE]"
  enabled = $true
} -Headers $authHeaders
Require-EnvelopeOk -Response $ruleResp -Scene "创建脱敏规则"

$sessionResp = Invoke-Api -Method "Post" -Path "/api/v1/chat/sessions" -Body @{
  title = "联调会话-$runId"
  runtime_profile_id = $null
  default_enabled_mcp_ids = @($mcpId)
} -Headers $authHeaders
Require-EnvelopeOk -Response $sessionResp -Scene "创建会话"
$sessionId = $sessionResp.data.id

Write-Step "上传附件并执行 Agent QA"
$tmpFile = Join-Path $env:TEMP "fh-acceptance-$runId.txt"
"联系方式: $phonePattern" | Set-Content -Path $tmpFile -Encoding utf8
$attachmentResp = Invoke-ApiMultipart -Path "/api/v1/chat/sessions/$sessionId/attachments" -Headers $authHeaders -FilePath $tmpFile
Require-EnvelopeOk -Response $attachmentResp -Scene "上传附件"
$attachmentId = $attachmentResp.data.id

$qaResp = Invoke-Api -Method "Post" -Path "/api/v1/agent/qa" -Body @{
  session_id = $sessionId
  query = "请总结附件重点"
  enabled_mcp_ids = @($mcpId)
  attachments_ids = @($attachmentId)
} -Headers $authHeaders
Require-EnvelopeOk -Response $qaResp -Scene "Agent QA"
Assert-True ($qaResp.data.context.attachment_chunks -ge 1) "QA 未注入附件上下文"

Write-Step "创建 KB、构建并检索"
$kbResp = Invoke-Api -Method "Post" -Path "/api/v1/knowledge-bases" -Body @{
  name = "kb-$runId"
  member_scope = "global"
  chunk_size = 600
  chunk_overlap = 80
  top_k = 8
  rerank_top_n = 4
} -Headers $authHeaders
Require-EnvelopeOk -Response $kbResp -Scene "创建 KB"
$kbId = $kbResp.data.id

$buildResp = Invoke-Api -Method "Post" -Path "/api/v1/knowledge-bases/$kbId/build" -Body @{
  documents = @(
    @{ title = "doc-a"; content = "高血压用药需规律监测血压" },
    @{ title = "doc-b"; content = "糖尿病管理重视饮食和运动" }
  )
} -Headers $authHeaders
Require-EnvelopeOk -Response $buildResp -Scene "KB 构建"

$retrievalResp = Invoke-Api -Method "Post" -Path "/api/v1/retrieval/query" -Body @{
  kb_id = $kbId
  query = "高血压 用药"
  top_k = 3
} -Headers $authHeaders
Require-EnvelopeOk -Response $retrievalResp -Scene "检索"
Assert-True ($retrievalResp.data.items.Count -ge 1) "检索结果为空"

Write-Step "创建导出任务并下载 ZIP"
$exportResp = Invoke-Api -Method "Post" -Path "/api/v1/exports/jobs" -Body @{
  member_scope = "global"
  export_types = @("chat", "kb")
  include_raw_file = $false
  include_sanitized_text = $true
  filters = @{ chat_limit = 200 }
} -Headers $authHeaders
Require-EnvelopeOk -Response $exportResp -Scene "创建导出任务"
$jobId = $exportResp.data.id

$jobDetailResp = Invoke-Api -Method "Get" -Path "/api/v1/exports/jobs/$jobId" -Body $null -Headers $authHeaders
Require-EnvelopeOk -Response $jobDetailResp -Scene "查询导出任务"
Assert-True ($jobDetailResp.data.status -eq "done") "导出任务未完成"

if (-not $DryRun) {
  $downloadUrl = "$BaseUrl/api/v1/exports/jobs/$jobId/download"
  $zipPath = Join-Path $env:TEMP "fh-export-$runId.zip"
  Invoke-WebRequest -Uri $downloadUrl -Headers $authHeaders -OutFile $zipPath -UseBasicParsing
  Assert-True (Test-Path $zipPath) "导出 ZIP 下载失败"
  Write-Host "导出文件: $zipPath" -ForegroundColor Green
}

Write-Step "联调验收通过"
Write-Host "全部链路通过: 登录 -> 配置 -> 对话 -> MCP -> KB -> 检索 -> 导出下载" -ForegroundColor Green
