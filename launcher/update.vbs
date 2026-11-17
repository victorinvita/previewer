' Lanza update.ps1 sin ventana y separado de la app (la app se detiene durante la actualizacion).
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & here & "\update.ps1"" -NoOpen", 0, False
