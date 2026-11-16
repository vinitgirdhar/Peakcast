$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$androidSdk = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
$javaRoot = 'C:/Program Files/Java/jdk-17/bin'
$buildTools = Join-Path $androidSdk 'build-tools/35.0.0'
$androidJar = Join-Path $androidSdk 'platforms/android-35/android.jar'
$buildRoot = Join-Path $projectRoot 'tmp/android-build'
$downloadRoot = Join-Path $projectRoot 'release/downloads'
New-Item -ItemType Directory -Force -Path "$buildRoot/res/drawable", "$buildRoot/classes", "$buildRoot/dex", "$buildRoot/source", $downloadRoot, "$projectRoot/data" | Out-Null
$preview = Get-Content "$projectRoot/output/remote-preview.json" | ConvertFrom-Json
$origin = [uri]$preview.url
if ($origin.Scheme -ne 'https' -or $origin.AbsolutePath -ne '/') { throw 'An HTTPS preview origin is required.' }
$source = (Get-Content "$projectRoot/android/MainActivity.java" -Raw).Replace('__ORIGIN__', $origin.GetLeftPart([System.UriPartial]::Authority))
[IO.File]::WriteAllText("$buildRoot/source/MainActivity.java",$source)
Copy-Item "$projectRoot/public/icon-192.png" "$buildRoot/res/drawable/ic_launcher.png"
& "$buildTools/aapt2.exe" compile --dir "$buildRoot/res" -o "$buildRoot/resources.zip"
if ($LASTEXITCODE) { throw 'Android resource compile failed' }
& "$buildTools/aapt2.exe" link -o "$buildRoot/unsigned.apk" -I $androidJar --manifest "$projectRoot/android/AndroidManifest.xml" "$buildRoot/resources.zip"
if ($LASTEXITCODE) { throw 'Android resource link failed' }
& "$javaRoot/javac.exe" -encoding UTF-8 -source 17 -target 17 -classpath $androidJar -d "$buildRoot/classes" "$buildRoot/source/MainActivity.java"
if ($LASTEXITCODE) { throw 'Android Java compile failed' }
$classFiles = @(Get-ChildItem "$buildRoot/classes" -Filter '*.class' -Recurse | ForEach-Object FullName)
& "$javaRoot/java.exe" -cp "$buildTools/lib/d8.jar" com.android.tools.r8.D8 --lib $androidJar --min-api 23 --output "$buildRoot/dex" @classFiles
if ($LASTEXITCODE) { throw 'Android dex compile failed' }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::Open("$buildRoot/unsigned.apk", [IO.Compression.ZipArchiveMode]::Update)
try { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,"$buildRoot/dex/classes.dex",'classes.dex') | Out-Null } finally { $archive.Dispose() }
& "$buildTools/zipalign.exe" -f 4 "$buildRoot/unsigned.apk" "$buildRoot/aligned.apk"
if ($LASTEXITCODE) { throw 'APK alignment failed' }
$keyStore = "$projectRoot/data/android-demo.jks"
if (!(Test-Path $keyStore)) {
 & "$javaRoot/keytool.exe" -genkeypair -keystore $keyStore -storepass android -keypass android -alias wildcatter -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Wildcatter Local Demo'
 if ($LASTEXITCODE) { throw 'Demo signing key creation failed' }
}
& "$javaRoot/java.exe" -jar "$buildTools/lib/apksigner.jar" sign --ks $keyStore --ks-key-alias wildcatter --ks-pass pass:android --key-pass pass:android --out "$downloadRoot/Wildcatter-Android.apk" "$buildRoot/aligned.apk"
if ($LASTEXITCODE) { throw 'APK signing failed' }
& "$javaRoot/java.exe" -jar "$buildTools/lib/apksigner.jar" verify "$downloadRoot/Wildcatter-Android.apk"
if ($LASTEXITCODE) { throw 'APK verification failed' }
Write-Output 'Android demo APK built and signature verified. This build connects to the temporary HTTPS preview.'
