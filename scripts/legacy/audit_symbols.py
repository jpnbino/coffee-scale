import re, pathlib, json
BASE=pathlib.Path('C:/Program Files/KiCad/10.0/share/kicad')
def parse(s):
    tokens=re.findall(r'"(?:\\.|[^"\\])*"|[^\s()]+|[()]',s); stack=[]; out=[]
    for t in tokens:
        if t=='(': stack.append(out); out=[]
        elif t==')': old=out; out=stack.pop(); out.append(old)
        else: out.append(t)
    return out[0]
def cs(a,k): return [v for v in a if isinstance(v,list) and v and v[0]==k]
def one(a,k): return next(iter(cs(a,k)),[])
def val(s): return json.loads(s) if s.startswith('"') else s
def q(s): return json.dumps(str(s),ensure_ascii=False)
def dump(a): return '('+' '.join(dump(x) if isinstance(x,list) else x for x in a)+')'
def load(lib):
    f,n=lib.split(':'); root=parse((BASE/'symbols'/f'{f}.kicad_sym').read_text(encoding='utf-8'))
    def resolve(n):
        a=next(x for x in cs(root,'symbol') if val(x[1])==n)
        if one(a,'extends'):
            import copy
            b=copy.deepcopy(resolve(val(one(a,'extends')[1])))
            for x in cs(b,'symbol'): x[1]=q(val(x[1]).replace(val(b[1])+'_',n+'_'))
            b[1]=q(n)
            for p in cs(a,'property'):
                b[:]=[x for x in b if not(isinstance(x,list) and x[:2]==p[:2])];b.append(p)
            return b
        return a
    return resolve(n)
def pins(a):
    return [p for sub in cs(a,'symbol') for p in cs(sub,'pin')]
if __name__=='__main__':
    for lib in ['MCU_Module:RaspberryPi_Pico_W_Debug','Connector:USB_C_Receptacle_USB2.0_16P','Analog_ADC:HX711','Battery_Management:DW01A','Battery_Management:MCP73831-2-OT','Regulator_Switching:TPS63031DSK','Power_Management:TPS22919DCK','Transistor_FET:AO3400A']:
        a=load(lib);print(lib,[(val(one(p,'number')[1]),val(one(p,'name')[1]),one(p,'at')[1:]) for p in pins(a)])
