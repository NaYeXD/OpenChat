#define MyAppName "OpenChat Server"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "OpenChat Contributors"
#define MyAppExeName "OpenChat Server"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\OpenChat Server
DefaultGroupName={#MyAppName}
OutputDir=..\..\release\windows
OutputBaseFilename=OpenChatServer-Setup-1.0.0
Compression=lzma
SolidCompression=yes
PrivilegesRequired=admin
MinVersion=10.0

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\..\*"; DestDir: "{app}"; Excludes: "installer\*,node_modules\*,.env,*.log,*.db,*.db-shm,*.db-wal,config\cert.pem,config\key.pem,env.example"; Flags: ignoreversion recursesubdirs
Source: "..\..\env.example"; DestDir: "{app}"; DestName: ".env"; Flags: onlyifdoesntexist

[Dirs]
Name: "{app}\logs"

[Run]
; npm install
Filename: "cmd.exe"; \
  Parameters: "/c npm install --omit=dev"; \
  WorkingDir: "{app}"; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "Installing dependencies..."

; Register + start the Windows Service
Filename: "cmd.exe"; \
  Parameters: "/c node scripts\install-service.js"; \
  WorkingDir: "{app}"; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "Registering Windows Service..."

[UninstallRun]
; Stop + remove the service before uninstalling
Filename: "cmd.exe"; \
  Parameters: "/c node scripts\uninstall-service.js"; \
  WorkingDir: "{app}"; \
  Flags: runhidden waituntilterminated

[Code]
// Check that Node.js v22.5+ is installed before proceeding
function NodeVersionOK(): Boolean;
var
  Output: AnsiString;
  ExitCode: Integer;
begin
  if not Exec('cmd.exe', '/c node --version > "%TEMP%\nodeversion.txt" 2>&1',
              '', SW_HIDE, ewWaitUntilTerminated, ExitCode) then
  begin
    Result := False;
    Exit;
  end;
  LoadStringFromFile(ExpandConstant('{%TEMP}\nodeversion.txt'), Output);
  // Must be v22.5 or higher
  Result := (ExitCode = 0) and
            (Pos('v22.', Output) > 0) or (Pos('v23.', Output) > 0) or
            (Pos('v24.', Output) > 0);
end;

function InitializeSetup(): Boolean;
begin
  if not NodeVersionOK() then
  begin
    MsgBox(
      'Node.js v22.5 or newer is required but was not found.'#13#10#13#10 +
      'Download it from https://nodejs.org and re-run this installer.',
      mbError, MB_OK
    );
    Result := False;
  end else
    Result := True;
end;