# HTTP server and network setup

The application uses Waitress 3.0.2 in one process. Existing URLs, startup flags,
project files, backups and device drivers are unchanged. After updating a source
installation, activate its environment and run:

```sh
python -m pip install -r requirements.txt
python run.py
```

Portable builds include this dependency. The default is still local HTTP at
`http://127.0.0.1:8080`, with the browser and tray enabled. The server should stay
on a trusted network. Replacing the HTTP server does not provide encryption or
make an equipment-control application suitable for unrestricted internet access.

## Hostnames and network clients

For access from other computers:

```sh
python run.py --host 0.0.0.0
```

The application accepts localhost, the bound address, and (when bound to all
interfaces) the machine's local addresses and hostnames discovered at startup.
Add DNS aliases explicitly; repeat the option for multiple aliases:

```sh
python run.py --host 0.0.0.0 --allowed-host hmi.example.internal
```

Use only the hostname, without a scheme, port or path. Unknown Host headers are
rejected to limit DNS-rebinding attacks. Restart after changing the machine's
network addresses. The equivalent flags work on `OopsAllButtons.exe`.

## HTTPS through a reverse proxy

Waitress serves HTTP. For encrypted browser access, terminate HTTPS at a reverse
proxy and keep the backend inaccessible to untrusted network clients. A proxy
running on the same computer can reach the default loopback listener:

```sh
python run.py --no-browser --no-tray --allowed-host hmi.example.internal --trusted-proxy 127.0.0.1
```

Configure the proxy to **replace**, rather than append arbitrary client values
for `X-Forwarded-Host`, `X-Forwarded-Proto`, and `X-Forwarded-For`. Forward the
external host (including its port if nonstandard), `https`, and the client IP.
Only the exact configured proxy IP is trusted; wildcard trust is unsupported.
For a proxy on another computer, bind to the appropriate interface, specify that
proxy's IP, and restrict the backend port with the host firewall.

The application compares browser write origins with the trusted external host
and scheme. HTTPS sessions receive Secure cookies; cookies retain HttpOnly and
SameSite=Strict. Untrusted forwarded headers are stripped. An HTTP connection to
the backend is still unencrypted, even if someone sends an HTTPS header.

## Resource and authentication limits

- Eight request workers, up to 100 client connections, a 128-connection backlog.
- A 16 KiB request-header cap and a 90,000,000-byte global request-body cap.
  Existing smaller route limits remain: normal JSON 1 MB, images 7.1 MB,
  page import 16 MB, asset uploads 36 MB, restore 90 MB. Larger buffered input
  spills to temporary files after 512 KiB; movies are streamed in 64 KiB chunks.
- Idle connections close after approximately 60 seconds, checked every 5 seconds.
  This is not a timeout that interrupts an ongoing device operation.
- Sign-in/setup requests are limited to 10 per client IP per minute and 60
  globally per minute, with a Retry-After response. Password hashing has two
  admission slots; excess concurrent attempts receive a retry response. Shared
  NAT clients share the IP limit. Proxy deployments must forward real client IPs.
- Expired or invalidated sessions are removed during requests. Session storage is
  bounded to 1,024 sessions total and 20 per user; oldest sessions are evicted
  when a cap is reached. User-selected expiry settings still apply, including
  Never. Sessions remain in memory and require sign-in after server restart.
- Authenticated writes retain CSRF checks and server-side user/role enforcement.
  GET and POST failures return safe errors; tracebacks stay in server logs.
  Browser responses include content-type, framing, referrer and document content
  security policies.

Tray Restart Server and Exit stop accepting new work and wait for active request
workers before closing device drivers. Slow clients are disconnected after a
30-second grace period; any remaining device operation must finish before shared
driver state is closed. Driver/network timeouts still govern those operations.

The automated transport tests use temporary projects and local sockets. They do
not establish compatibility with physical devices or certify a deployment.

References: [Waitress arguments](https://docs.pylonsproject.org/projects/waitress/en/stable/arguments.html),
[reverse proxy configuration](https://docs.pylonsproject.org/projects/waitress/en/stable/reverse-proxy.html).


## Listening port

The default is 8080. Administrators can change it in Administration → Site Configuration → Server Settings and choose Save, then confirm the restart. The application checks a changed port before saving, restarts with the existing startup options, and provides a link to the new browser address. The bind host is unchanged. A saved port is used on subsequent starts; an explicit `--port` argument overrides it. Applying from Administration also replaces an existing port argument for that restart. This requires launching the application through run.py or the portable executable so the restart lifecycle is available.

Site Configuration stages port, sign-in and logo edits under its shared Save/Revert buttons. Save confirms restart/session changes and submits one validated configuration update; a rejected port or credential leaves all settings unchanged. Port changes restart only after the response; sign-in changes invalidate existing sessions.
