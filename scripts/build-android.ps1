# Builds the Android app without Gradle.
#   Default:  a signed APK for local testing (demo key unless an upload key is set).
#   -Bundle:  a signed .aab for Google Play. Requires the upload key environment variables:
#             WILDCATTER_KEYSTORE, WILDCATTER_KEY_ALIAS, WILDCATTER_STORE_PASS, WILDCATTER_KEY_PASS
param([string]$Origin = 'https://wildcatter-p3yy.onrender.com', [switch]$Bundle)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$androidSdk = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
$javaRoot = 'C:/Program Files/Java/jdk-17/bin'
$buildTools = Join-Path $androidSdk 'build-tools/36.0.0'
$androidJar = Join-Path $androidSdk 'platforms/android-36/android.jar'
# bundletool: BUNDLETOOL_JAR (the standalone -all jar), else the copy Android Studio's Gradle cached, run with its dependencies.
function Get-BundletoolArgs {
 if ($env:BUNDLETOOL_JAR) { return @('-jar', $env:BUNDLETOOL_JAR) }
 $cache = "$env:USERPROFILE/.gradle/caches/modules-2/files-2.1"
 $artifacts = 'com.android.tools.build/bundletool', 'com.google.guava/guava', 'com.google.guava/failureaccess', 'com.google.protobuf/protobuf-java', 'com.google.protobuf/protobuf-java-util', 'com.android.tools.build/aapt2-proto', 'com.google.dagger/dagger', 'javax.inject/javax.inject', 'org.bitbucket.b_c/jose4j', 'com.google.code.gson/gson', 'com.google.auto.value/auto-value-annotations', 'com.google.errorprone/error_prone_annotations', 'org.slf4j/slf4j-api', 'com.android.tools.build/apksig', 'com.android.tools.build/apkzlib', 'com.android.tools/common', 'com.android.tools/annotations', 'jakarta.inject/jakarta.inject-api', 'com.google.code.findbugs/jsr305'
 $jars = foreach ($artifact in $artifacts) {
  $dir = Join-Path $cache $artifact
  if (Test-Path $dir) {
   # ponytail: newest version by folder name; pin BUNDLETOOL_JAR if this ever picks a mismatched set.
   Get-ChildItem $dir -Recurse -Filter *.jar | Where-Object Name -NotMatch 'sources|javadoc' | Sort-Object { [version]((($_.Directory.Parent.Name -replace '[^0-9.].*$', '') + '.0') -replace '^(\d+\.\d+(\.\d+)?).*$', '$1') } | Select-Object -Last 1 -ExpandProperty FullName
  }
 }
 if (!($jars | Where-Object { $_ -match 'bundletool' })) { return $null }
 return @('-cp', ($jars -join ';'), 'com.android.tools.build.bundletool.BundleToolMain')
}
$buildRoot = Join-Path $projectRoot 'tmp/android-build'
$downloadRoot = Join-Path $projectRoot 'release/downloads'
Remove-Item -Recurse -Force $buildRoot -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$buildRoot/res/drawable", "$buildRoot/classes", "$buildRoot/dex", "$buildRoot/source", $downloadRoot, "$projectRoot/data" | Out-Null

$appOrigin = [uri]$Origin
if (!$appOrigin.IsAbsoluteUri -or $appOrigin.Scheme -ne 'https' -or $appOrigin.AbsolutePath -ne '/' -or $appOrigin.UserInfo -or $appOrigin.Query -or $appOrigin.Fragment) { throw 'An HTTPS application origin without credentials, path, query or fragment is required.' }
$backendOrigin = $appOrigin.GetLeftPart([System.UriPartial]::Authority)
# The shared public launcher targets production; custom API builds retain direct entry.
$startOrigin = if ($backendOrigin -eq 'https://wildcatter-p3yy.onrender.com') { 'https://wildcatter-welcome.onrender.com' } else { '' }
$source = (Get-Content "$projectRoot/android/MainActivity.java" -Raw).Replace('__ORIGIN__', $backendOrigin).Replace('__START_ORIGIN__', $startOrigin)
[IO.File]::WriteAllText("$buildRoot/source/MainActivity.java", $source)
Copy-Item "$projectRoot/public/icon-192.png" "$buildRoot/res/drawable/ic_launcher.png"

# Upload key from the environment; never committed. The demo key is for local APKs only.
$upload = $env:WILDCATTER_KEYSTORE -and $env:WILDCATTER_KEY_ALIAS -and $env:WILDCATTER_STORE_PASS -and $env:WILDCATTER_KEY_PASS
if ($Bundle -and !$upload) { throw 'A Play bundle needs the upload key: set WILDCATTER_KEYSTORE, WILDCATTER_KEY_ALIAS, WILDCATTER_STORE_PASS and WILDCATTER_KEY_PASS.' }
$bundletool = if ($Bundle) { Get-BundletoolArgs }
if ($Bundle -and !$bundletool) { throw 'bundletool not found. Set BUNDLETOOL_JAR to the standalone bundletool-all .jar.' }

& "$buildTools/aapt2.exe" compile --dir "$buildRoot/res" -o "$buildRoot/resources.zip"
if ($LASTEXITCODE) { throw 'Android resource compile failed' }
& "$javaRoot/javac.exe" -encoding UTF-8 -source 17 -target 17 -Xlint:-options -classpath $androidJar -d "$buildRoot/classes" "$buildRoot/source/MainActivity.java"
if ($LASTEXITCODE) { throw 'Android Java compile failed' }
$classFiles = @(Get-ChildItem "$buildRoot/classes" -Filter '*.class' -Recurse | ForEach-Object FullName)
& "$javaRoot/java.exe" -cp "$buildTools/lib/d8.jar" com.android.tools.r8.D8 --release --lib $androidJar --min-api 23 --output "$buildRoot/dex" @classFiles
if ($LASTEXITCODE) { throw 'Android dex compile failed' }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

if ($Bundle) {
 # Play bundle: proto-format resources, rearranged into a bundletool base module.
 & "$buildTools/aapt2.exe" link --proto-format -o "$buildRoot/proto.zip" -I $androidJar --manifest "$projectRoot/android/AndroidManifest.xml" "$buildRoot/resources.zip"
 if ($LASTEXITCODE) { throw 'Android proto resource link failed' }
 $moduleRoot = "$buildRoot/base"
 [IO.Compression.ZipFile]::ExtractToDirectory("$buildRoot/proto.zip", $moduleRoot)
 New-Item -ItemType Directory -Force -Path "$moduleRoot/manifest", "$moduleRoot/dex" | Out-Null
 Move-Item "$moduleRoot/AndroidManifest.xml" "$moduleRoot/manifest/AndroidManifest.xml"
 Copy-Item "$buildRoot/dex/classes.dex" "$moduleRoot/dex/classes.dex"
 # Windows PowerShell writes "\" into entry names; bundletool needs "/".
 $module = [IO.Compression.ZipFile]::Open("$buildRoot/base.zip", [IO.Compression.ZipArchiveMode]::Create)
 try {
  $rootPath = (Resolve-Path $moduleRoot).Path
  foreach ($file in Get-ChildItem $moduleRoot -Recurse -File) {
   $entry = $file.FullName.Substring($rootPath.Length + 1).Replace([IO.Path]::DirectorySeparatorChar, '/')
   [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($module, $file.FullName, $entry) | Out-Null
  }
 } finally { $module.Dispose() }
 $aab = "$downloadRoot/Wildcatter-Android.aab"
 Remove-Item $aab -ErrorAction SilentlyContinue
 & "$javaRoot/java.exe" @bundletool build-bundle --modules="$buildRoot/base.zip" --output=$aab
 if ($LASTEXITCODE) { throw 'Bundle build failed' }
 & "$javaRoot/jarsigner.exe" -keystore $env:WILDCATTER_KEYSTORE -storepass:env WILDCATTER_STORE_PASS -keypass:env WILDCATTER_KEY_PASS -sigalg SHA256withRSA -digestalg SHA-256 $aab $env:WILDCATTER_KEY_ALIAS
 if ($LASTEXITCODE) { throw 'Bundle signing failed' }
 & "$javaRoot/java.exe" @bundletool validate --bundle=$aab | Out-Null
 if ($LASTEXITCODE) { throw 'Bundle validation failed' }
 Write-Output "Play bundle built, signed with the upload key and validated: $aab"
 return
}

& "$buildTools/aapt2.exe" link -o "$buildRoot/unsigned.apk" -I $androidJar --manifest "$projectRoot/android/AndroidManifest.xml" "$buildRoot/resources.zip"
if ($LASTEXITCODE) { throw 'Android resource link failed' }
$archive = [IO.Compression.ZipFile]::Open("$buildRoot/unsigned.apk", [IO.Compression.ZipArchiveMode]::Update)
try { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, "$buildRoot/dex/classes.dex", 'classes.dex') | Out-Null } finally { $archive.Dispose() }
& "$buildTools/zipalign.exe" -f 4 "$buildRoot/unsigned.apk" "$buildRoot/aligned.apk"
if ($LASTEXITCODE) { throw 'APK alignment failed' }
if ($upload) {
 $signing = @('--ks', $env:WILDCATTER_KEYSTORE, '--ks-key-alias', $env:WILDCATTER_KEY_ALIAS, '--ks-pass', 'env:WILDCATTER_STORE_PASS', '--key-pass', 'env:WILDCATTER_KEY_PASS')
} else {
 $keyStore = "$projectRoot/data/android-demo.jks"
 if (!(Test-Path $keyStore)) {
  & "$javaRoot/keytool.exe" -genkeypair -keystore $keyStore -storepass android -keypass android -alias wildcatter -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Wildcatter Local Demo'
  if ($LASTEXITCODE) { throw 'Demo signing key creation failed' }
 }
 $signing = @('--ks', $keyStore, '--ks-key-alias', 'wildcatter', '--ks-pass', 'pass:android', '--key-pass', 'pass:android')
}
& "$javaRoot/java.exe" -jar "$buildTools/lib/apksigner.jar" sign @signing --out "$downloadRoot/Wildcatter-Android.apk" "$buildRoot/aligned.apk"
if ($LASTEXITCODE) { throw 'APK signing failed' }
& "$javaRoot/java.exe" -jar "$buildTools/lib/apksigner.jar" verify "$downloadRoot/Wildcatter-Android.apk"
if ($LASTEXITCODE) { throw 'APK verification failed' }
Write-Output "Android APK built and signature verified$(if (!$upload) { ' (demo key, not for Play)' }). This build connects to $backendOrigin."
