param([Parameter(Mandatory=$true)][string]$Address,[int]$Port=5443)
$ErrorActionPreference='Stop'
$parsedAddress=[System.Net.IPAddress]::Parse($Address)
if($parsedAddress.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork){throw 'Informe um endereço IPv4 da rede local.'}
if($Address -notmatch '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)'){throw 'Use um IP privado da rede local.'}
if($Port -lt 1024 -or $Port -gt 65535){throw 'Porta inválida.'}
$projectPath=Split-Path $PSScriptRoot -Parent
$tlsPath=Join-Path $projectPath '.local-data/tls'
New-Item -ItemType Directory -Force $tlsPath | Out-Null
$certificatePath=Join-Path $tlsPath 'guiche-cert.pem'
$keyPath=Join-Path $tlsPath 'guiche-key.pem'
if((Test-Path -LiteralPath $certificatePath) -or (Test-Path -LiteralPath $keyPath)){throw 'Já existe um certificado. Preserve-o; a renovação deve ser planejada com a TI.'}
$rsa=[System.Security.Cryptography.RSA]::Create(3072)
try {
 $request=[System.Security.Cryptography.X509Certificates.CertificateRequest]::new("CN=$Address",$rsa,[System.Security.Cryptography.HashAlgorithmName]::SHA256,[System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
 $san=[System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
 $san.AddIpAddress($parsedAddress)
 $san.AddIpAddress([System.Net.IPAddress]::Parse('127.0.0.1'))
 $san.AddDnsName('localhost')
 $request.CertificateExtensions.Add($san.Build())
 $request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false,$false,0,$true))
 $request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new([System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature -bor [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyEncipherment,$true))
 $oids=[System.Security.Cryptography.OidCollection]::new()
 [void]$oids.Add([System.Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.1'))
 $request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($oids,$false))
 $certificate=$request.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-5),[DateTimeOffset]::UtcNow.AddDays(90))
 [IO.File]::WriteAllText($certificatePath,$certificate.ExportCertificatePem())
 [IO.File]::WriteAllText($keyPath,$rsa.ExportPkcs8PrivateKeyPem())
 $network=@{origin=('https://'+$Address+':'+$Port);certificate=$certificatePath;key=$keyPath}
 $network | ConvertTo-Json | Set-Content (Join-Path $projectPath '.local-data/network.json')
 Write-Output "Certificado criado apenas em arquivos locais; nenhum certificado foi instalado no Windows."
 Write-Output "Endereço preparado: $($network.origin)"
 Write-Output "Válido até: $($certificate.NotAfter.ToString('yyyy-MM-dd'))"
 Write-Output "Impressão SHA-256: $($certificate.GetCertHashString([System.Security.Cryptography.HashAlgorithmName]::SHA256))"
} finally {$rsa.Dispose()}
