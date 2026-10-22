"""Persisted listening port with an application-owned restart callback."""
import socket
import threading


def port_number(value):
    if isinstance(value,bool):raise ValueError('Enter a port from 1 to 65535')
    try:port=int(value)
    except (ValueError,TypeError,OverflowError):raise ValueError('Enter a port from 1 to 65535') from None
    if not 1<=port<=65535 or isinstance(value,float) and value!=port:raise ValueError('Enter a port from 1 to 65535')
    return port


class ServerSettings:
    def __init__(self,store):
        self.store=store;self.port=8080;self.host='127.0.0.1';self.restart=None;self.pending=False;self.lock=threading.Lock()

    def startup_port(self,command_port=8080,explicit=False):
        saved=self.store.get('server_port')
        return port_number(command_port if explicit or not isinstance(saved,int) else saved)

    def snapshot(self):return {'port':self.port,'can_restart':callable(self.restart),'pending':self.pending}

    def apply(self,data,save=None):
        port=port_number(data.get('port'))
        with self.lock:
            if not self.restart:raise ValueError('Server restart is unavailable in this environment')
            if self.pending:raise ValueError('Server restart is already pending')
            if port!=self.port:
                family,kind,protocol,_,address=socket.getaddrinfo(self.host or None,port,type=socket.SOCK_STREAM,flags=socket.AI_PASSIVE)[0]
                try:
                    with socket.socket(family,kind,protocol) as probe:
                        if hasattr(socket,'SO_EXCLUSIVEADDRUSE'):probe.setsockopt(socket.SOL_SOCKET,socket.SO_EXCLUSIVEADDRUSE,1)
                        if family==socket.AF_INET6:probe.setsockopt(socket.IPPROTO_IPV6,socket.IPV6_V6ONLY,1)
                        probe.bind(address)
                except OSError as error:raise ValueError('That port cannot be used: '+str(error)) from None
            if save:save(port)
            else:self.store.set('server_port',port)
            self.pending=True
            # Allow the HTTP response to finish before initiating normal shutdown.
            timer=threading.Timer(.3,self.restart,args=(port,));timer.daemon=True;timer.start()
            return {'ok':True,'port':port,'restarting':True}
