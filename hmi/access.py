"""User administration and action access, independent of browser-supplied roles."""
import hashlib
import hmac
import secrets
import threading
import uuid


def password_hash(password, salt):
    return hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 600_000).hex()


class Access:
    def __init__(self, service):
        self.service=service;self.store=service.store;self.lock=threading.RLock()
        with self.lock:
            if self.store.get('users') is None:
                old=self.store.get('account')
                self.store.set('users', [{**old,'id':uuid.uuid4().hex,'administrator':True,'roles':[],'revision':1}] if old else [])

            if not self.store.get('system_theme_default_applied',False):
                self.store.set('users',[{**user,'theme':'system'} for user in self.users()])
                self.store.set('system_theme_default_applied',True)

    def users(self):return self.store.get('users', [])
    def roles(self):return self.store.get('access_roles', [])
    @staticmethod
    def public(user):return {**{key:user[key] for key in ('id','username','administrator','roles')},'kiosk':user.get('kiosk',False),'starting_page':user.get('starting_page',''),'theme':user.get('theme','system')}

    def current(self, record):
        user=next((u for u in self.users() if u['id']==record.get('user_id') and u['revision']==record.get('revision')),None)
        return user

    def login(self, username, password):
        user=next((u for u in self.users() if u['username'].casefold()==username.casefold()),None)
        if not user or not hmac.compare_digest(password_hash(password,user['salt']),user['hash']):
            return None
        return user

    def save_user(self, data, actor=None, setup=False):
        with self.lock:
            users=self.users();original=next((u for u in users if u['id']==data.get('id')),None)
            if data.get('id') and not original:raise ValueError('Unknown user')
            if setup and users:raise ValueError('Setup is already complete')
            name=str(data.get('username','')).strip()
            if not name or len(name)>100 or any(u['id']!=data.get('id') and u['username'].casefold()==name.casefold() for u in users):raise ValueError('Username is empty or already exists')
            roles=data.get('roles',[])
            if not isinstance(roles,list) or any(role not in {r['id'] for r in self.roles()} for role in roles):raise ValueError('Unknown access role')
            user={**(original or {}),'id':original['id'] if original else uuid.uuid4().hex,'username':name,'administrator':True if setup else data.get('administrator') is True,'roles':list(dict.fromkeys(roles)),'revision':original.get('revision',1) if original else 1}
            user['kiosk']=data.get('kiosk',original.get('kiosk',False) if original else False) is True
            user['starting_page']=str(data.get('starting_page',original.get('starting_page','') if original else ''))
            if user['starting_page'] and not any(page['id']==user['starting_page'] for page in self.service.pages()):raise ValueError('Choose an existing starting page')
            user['theme']=data.get('theme',original.get('theme','system') if original else 'system')
            if user['theme'] not in ('light','dark','system'):raise ValueError('Choose Light, Dark, or System theme')
            password=str(data.get('password',''))
            if password or not original:
                if len(password)<12:raise ValueError('Use a password of at least 12 characters')
                user['salt']=secrets.token_hex(16);user['hash']=password_hash(password,user['salt'])
                if original:user['revision']+=1
            next_users=[user if u['id']==user['id'] else u for u in users] if original else users+[user]
            if not any(u['administrator'] and not u.get('kiosk',False) for u in next_users):raise ValueError('Keep at least one administrator outside Kiosk Mode')
            self.store.set('users',next_users)
            return user

    def preferences(self, user_id, data):
        theme=data.get('theme')
        if theme not in ('light','dark','system'):raise ValueError('Choose Light, Dark, or System theme')
        with self.lock:
            users=self.users();user=next((u for u in users if u['id']==user_id),None)
            if user is None:raise ValueError('User unavailable')
            user['theme']=theme;self.store.set('users',users)
            return {'theme':theme}

    def remove_user(self, identity, actor):
        with self.lock:
            if identity==actor['id']:raise ValueError('You cannot remove your own signed-in account')
            users=self.users()
            if not any(u['id']==identity for u in users):raise ValueError('Unknown user')
            users=[u for u in users if u['id']!=identity]
            if not any(u['administrator'] and not u.get('kiosk',False) for u in users):raise ValueError('Keep at least one administrator outside Kiosk Mode')
            self.store.set('users',users)

    def save_role(self,data):
        with self.lock:
            roles=self.roles();identity=data.get('id') or uuid.uuid4().hex;name=str(data.get('name','')).strip()
            if data.get('id') and not any(r['id']==identity for r in roles):raise ValueError('Unknown role')
            if not name or len(name)>100 or any(r['id']!=identity and r['name'].casefold()==name.casefold() for r in roles):raise ValueError('Role name is empty or already exists')
            role={'id':identity,'name':name};self.store.set('access_roles',[r for r in roles if r['id']!=identity]+[role]);return role

    def remove_role(self,identity):
        with self.lock:
            if any(identity in u['roles'] for u in self.users()):raise ValueError('This role is assigned to a user')
            if any(c.get('type')=='listbox' and identity in c.get('requiredRoles',[]) for p in self.service.pages() for c in p.get('controls',[])):raise ValueError('This role is required by a saved listbox')
            if any(identity in a.get('requiredRoles',[]) for p in self.service.pages() for c in [p,*p.get('controls',[])] for a in c.get('actions',[])):raise ValueError('This role is required by a saved action')
            self.store.set('access_roles',[r for r in self.roles() if r['id']!=identity])

    def authorize(self,user,data):
        reference=data.get('_access',{})
        page=next((p for p in self.service.pages() if p['id']==reference.get('page')),None)
        control=page if page and reference.get('control')=='@page' else next((c for c in (page or {}).get('controls',[]) if c['id']==reference.get('control')),None)
        action=next((a for a in (control or {}).get('actions',[]) if a['id']==reference.get('action')),None)
        if action is None:raise PermissionError('Saved action unavailable; reload the page')
        required=action.get('requiredRoles',[])
        if not isinstance(required,list) or (not user['administrator'] and not set(required).issubset(user['roles'])):raise PermissionError('You do not have the required access roles for this action')
        bindings=reference.get('bindings',{})
        def resolve(tag):return bindings.get(tag,'') if isinstance(tag,str) and tag.startswith('parameter:') else tag
        result={**action,'tag':resolve(action.get('tag'))}
        if action.get('parameters'):result['parameters']={k:resolve(v) for k,v in action['parameters'].items()}
        if action['action']=='value_input' and 'value' in data:result['value']=data['value']
        return result

    def listbox_action(self,user,data):
        page=next((p for p in self.service.pages() if p['id']==data.get('page')),None)
        control=next((c for c in (page or {}).get('controls',[]) if c['id']==data.get('control') and c['type']=='listbox'),None)
        index=data.get('value')
        if not control or not control.get('touchable',True) or not isinstance(index,int) or not 1<=index<=len(control.get('elements',[])):raise PermissionError('Listbox interaction is unavailable')
        required=control.get('requiredRoles',[])
        if not isinstance(required,list) or (not user['administrator'] and not set(required).issubset(user['roles'])):raise PermissionError('You do not have the required access roles to change this listbox')
        tag=control.get('binding',{}).get('tag','')
        if tag.startswith('parameter:'):tag=data.get('bindings',{}).get(tag,'')
        return {'action':'set','tag':tag,'value':index}
