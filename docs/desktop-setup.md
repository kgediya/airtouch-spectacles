# Desktop Setup

## macOS

Install optional Quartz bridge:

```bash
python3 -m pip install --user -r mac-companion/requirements-macos.txt
```

Run dry-run:

```bash
cd mac-companion
python3 server.py --dry-run
```

Run real cursor mode:

```bash
python3 server.py
```

Send fake packets, including scroll:

```bash
python3 fake_client.py
python3 fake_client.py --drag
python3 fake_client.py --scroll
```

If the cursor does not move, grant Accessibility permission:

```txt
System Settings > Privacy & Security > Accessibility
```

Enable Terminal, Python, or your IDE.

Find your IP:

```bash
ipconfig getifaddr en0
```

## Windows

Python 3 is required. No mouse-control package is required.

Run dry-run:

```powershell
cd mac-companion
py server.py --dry-run
```

Run real cursor mode:

```powershell
py server.py
```

Send fake packets, including scroll:

```powershell
py fake_client.py
py fake_client.py --drag
py fake_client.py --scroll
```

Find your IP:

```powershell
ipconfig
```

Look for the IPv4 address of your active Wi-Fi or Ethernet adapter.

If Spectacles cannot connect:

- enable Experimental API mode in Lens Studio so `InternetModule` can open the WebSocket connection
- allow Python through Windows Firewall
- make sure both devices are on the same network
- include the port in Lens Studio: `ws://DESKTOP_IP:8765`

## Fake Hand

Test without Lens Studio:

```bash
python3 server.py --dry-run --fake-hand
```

Move the real cursor without Spectacles:

```bash
python3 server.py --fake-hand
```

On Windows, use:

```powershell
py server.py --dry-run --fake-hand
py server.py --fake-hand
```
