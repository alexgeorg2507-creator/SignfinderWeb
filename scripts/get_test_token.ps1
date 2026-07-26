<#
.SYNOPSIS
  Получить свежий Firebase ID token (JWT) для ручных проверок API SignFinder
  на test или prod — без похода в DevTools.

.DESCRIPTION
  Использует Firebase Auth REST API (signInWithPassword). Firebase Web API key
  НЕ секретный — он открыто встроен в app/index.html (так и задумано:
  безопасность держится на Firebase Security Rules / backend-авторизации,
  не на секретности этого ключа). Пароль твоего тестового аккаунта нигде
  не хранится и не пишется на диск — вводится каждый раз через безопасный
  промпт (звёздочки), в открытом виде существует только в памяти процесса
  на время запроса.

.PARAMETER Email
  Email тестового аккаунта (Firebase Auth, Email/Password провайдер).

.PARAMETER Env
  test (по умолчанию) или prod.

.EXAMPLE
  .\get_test_token.ps1 -Email me@example.com
  .\get_test_token.ps1 -Email me@example.com -Env prod
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Email,

    [ValidateSet("test", "prod")]
    [string]$Env = "test"
)

# Firebase Web API keys — публичные, встроены в app/index.html (FIREBASE_CONFIG).
# Не секреты, но всё равно не тот ключ которым можно причинить вред — Security
# Rules и backend-авторизация не зависят от его секретности.
$ApiKeys = @{
    test = "AIzaSyBBkhxwQbKwwwq7ald_v7Nv54yTwXLd5c4"
    prod = "AIzaSyAv9NLFuBj1uQbdmxZxVU7YC5bLfdNufuM"
}

$HostUrls = @{
    test = "https://signfinder-cab-test.web.app"
    prod = "https://signfinder.app"
}

$apiKey = $ApiKeys[$Env]

$securePass = Read-Host -Prompt "Пароль для $Email ($Env)" -AsSecureString
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePass)
$plainPass = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

$body = @{
    email             = $Email
    password          = $plainPass
    returnSecureToken = $true
} | ConvertTo-Json

$uri = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$apiKey"

try {
    $resp = Invoke-RestMethod -Uri $uri -Method Post -Body $body -ContentType "application/json"
}
catch {
    Write-Host "Ошибка авторизации:" -ForegroundColor Red
    if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
    else { Write-Host $_.Exception.Message }
    exit 1
}
finally {
    $plainPass = $null
    $body = $null
}

$token = $resp.idToken

if (-not $token) {
    Write-Host "Не получили idToken — проверь ответ Firebase выше." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Получен токен для $Email ($Env), действителен ~1 час." -ForegroundColor Green
Write-Host ""

try {
    Set-Clipboard -Value $token
    Write-Host "Токен скопирован в буфер обмена." -ForegroundColor Cyan
}
catch {
    Write-Host "Не удалось скопировать в буфер — токен ниже, скопируй руками:" -ForegroundColor Yellow
}

Write-Host ""
Write-Host $token
Write-Host ""
Write-Host "Пример использования:" -ForegroundColor DarkGray
Write-Host "  curl -H `"Authorization: Bearer <токен>`" $($HostUrls[$Env])/api/v1/me/profile" -ForegroundColor DarkGray
