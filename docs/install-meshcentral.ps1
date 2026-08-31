#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"
$Root = "C:\MeshCentral"
$ConfigSource = Join-Path $PSScriptRoot "meshcentral-config.example.json"

Write-Host "Instalando MeshCentral em $Root"
New-Item -ItemType Directory -Force -Path $Root | Out-Null
Set-Location $Root
npm install meshcentral

$dest = Join-Path $Root "meshcentral-data\config.json"
New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
if (-not (Test-Path $dest)) {
  Copy-Item $ConfigSource $dest
  Write-Host "Config copiado. Edite cert/IP em $dest"
} else {
  Write-Host "config.json já existe — não sobrescrevi."
}

Write-Host ""
Write-Host "Subir:  cd $Root ; node node_modules\meshcentral"
Write-Host "Abra https://192.168.15.12:4443  (aceite o certificado)"
Write-Host "A primeira conta vira administrador. Depois: criar grupo AdelMsp."
Write-Host "Baixar o agente Windows x64 e copiar para:"
Write-Host "  E:\Meus Projetos\adelmsp\private\mesh\AdelMsp.Remote.exe"
Write-Host "Anote MeshID (hex) no .env: MESHCENTRAL_MESH_ID"
Write-Host "Opcional (serviço Windows): node node_modules\meshcentral --install"
