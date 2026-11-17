#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <limits>
#include <queue>
#include <string>
#include <vector>
using namespace std;
struct Pt { double x,y; };
struct Terminal { int x,y,l; };
struct Net { int id; string name; vector<Terminal> p; double width; };
int W,H,N,searchBudget=12000000; double step,ox,oy;
vector<uint16_t> occ,pth; vector<uint8_t> novias;
vector<int> dista,parent,stamp; int epoch=0;
int idx(int x,int y,int l){return l*N+y*W+x;}
void mark(int x,int y,int l,int net){int i=idx(x,y,l); if(!occ[i]||occ[i]==net)occ[i]=net;else occ[i]=65535;}
double segdist(double x,double y,Pt a,Pt b){double dx=b.x-a.x,dy=b.y-a.y,t=((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy+1e-30);t=max(0.,min(1.,t));return hypot(x-a.x-dx*t,y-a.y-dy*t);}
bool inside(double x,double y,const vector<Pt>& p){bool in=false;for(size_t i=0,j=p.size()-1;i<p.size();j=i++)if(((p[i].y>y)!=(p[j].y>y))&&(x<(p[j].x-p[i].x)*(y-p[i].y)/(p[j].y-p[i].y)+p[i].x))in=!in;return in;}
void polygon(const vector<Pt>& p,int layers,int net,double margin,bool noVia){
 double x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(auto a:p){x0=min(x0,a.x);x1=max(x1,a.x);y0=min(y0,a.y);y1=max(y1,a.y);}
 // Imported tracks are convex capsules sampled as two 13-point semicircles.
 // Rasterize their conservative analytic envelope instead of testing 26 edges
 // at every pixel of a long diagonal track's bounding rectangle.
 bool capsule=p.size()==26;Pt ca{},cb{};double radius=0;
 if(capsule){
  ca={(p[0].x+p[12].x)/2,(p[0].y+p[12].y)/2};
  cb={(p[13].x+p[25].x)/2,(p[13].y+p[25].y)/2};
  radius=hypot(p[0].x-ca.x,p[0].y-ca.y);
  for(int j=0;j<26;j++){Pt c=j<13?ca:cb;if(abs(hypot(p[j].x-c.x,p[j].y-c.y)-radius)>0.00001)capsule=false;}
  if((p[6].x-ca.x)*(ca.x-cb.x)+(p[6].y-ca.y)*(ca.y-cb.y)<-0.00001)capsule=false;
  if((p[19].x-cb.x)*(cb.x-ca.x)+(p[19].y-cb.y)*(cb.y-ca.y)<-0.00001)capsule=false;
 }
 int a=max(0,int(floor((x0-margin-ox)/step))),b=min(W-1,int(ceil((x1+margin-ox)/step))),c=max(0,int(floor((y0-margin-oy)/step))),d=min(H-1,int(ceil((y1+margin-oy)/step)));
 for(int y=c;y<=d;y++)for(int x=a;x<=b;x++){double px=ox+x*step,py=oy+y*step;bool hit=capsule?segdist(px,py,ca,cb)<=radius+margin:inside(px,py,p);if(!capsule&&!hit)for(size_t k=0;k<p.size();k++)if(segdist(px,py,p[k],p[(k+1)%p.size()])<=margin){hit=true;break;}if(hit){if(noVia)novias[y*W+x]=1;else for(int l=0;l<2;l++)if(layers&(1<<l))mark(x,y,l,net);}}
}
bool available(int x,int y,int l,int net,int extra=0){
 if(x<extra+1||y<extra+1||x>=W-extra-1||y>=H-extra-1)return false;
 for(int dy=-extra;dy<=extra;dy++)for(int dx=-extra;dx<=extra;dx++){if(dx*dx+dy*dy>extra*extra)continue;int v=occ[idx(x+dx,y+dy,l)];if(v&&v!=net)return false;}return true;
}
void stroke(int x0,int y0,int x1,int y1,int l,int net,double radius){
 int r=int(ceil(radius/step)),xmin=max(0,min(x0,x1)-r),xmax=min(W-1,max(x0,x1)+r),ymin=max(0,min(y0,y1)-r),ymax=min(H-1,max(y0,y1)+r);
 for(int y=ymin;y<=ymax;y++)for(int x=xmin;x<=xmax;x++)if(segdist(x*step,y*step,{x0*step,y0*step},{x1*step,y1*step})<=radius)mark(x,y,l,net);
}
struct Q {int f,g,i;bool operator<(Q const& b)const{return f>b.f;}};
vector<int> astar(Terminal a,Terminal b,int net,double width,bool topOnly=false,int budget=12000000){
 ++epoch;priority_queue<Q> q;int ex=max(0,int(ceil((width/2-.1)/step-1e-6)));
 bool reachableTarget=false;
 for(int l=0;l<2;l++)if((b.l<0||b.l==l)&&available(b.x,b.y,l,net,ex))reachableTarget=true;
 if(!reachableTarget)return {};
 auto heur=[&](int x,int y,int l){int dx=abs(x-b.x),dy=abs(y-b.y);return 10*max(dx,dy)+4*min(dx,dy)+(b.l>=0&&b.l!=l?650:0);};
 for(int l=0;l<2;l++)if((a.l<0||a.l==l)&&available(a.x,a.y,l,net,ex)){int i=idx(a.x,a.y,l);dista[i]=0;stamp[i]=epoch;parent[i]=-1;q.push({heur(a.x,a.y,l),0,i});}
 int dxs[8]={1,1,0,-1,-1,-1,0,1},dys[8]={0,1,1,1,0,-1,-1,-1};int goal=-1,visits=0;
 while(!q.empty()){
  Q cur=q.top();q.pop();int i=cur.i;if(stamp[i]!=epoch||dista[i]!=cur.g)continue;
  int l=i/N,k=i%N,x=k%W,y=k/W;if(x==b.x&&y==b.y&&(b.l<0||b.l==l)){goal=i;break;}
  if(++visits>budget)break;
  for(int dir=0;dir<9;dir++){
   int nx=x,ny=y,nl=l,cost=0;
   if(dir<8){nx+=dxs[dir];ny+=dys[dir];if(!available(nx,ny,l,net,ex))continue;
    if(dxs[dir]&&dys[dir]&&(!available(nx,y,l,net,ex)||!available(x,ny,l,net,ex)))continue;
    cost=(dir%2?14:10);if((l==0&&dxs[dir]==0)||(l==1&&dys[dir]==0))cost+=1;
    if(parent[i]>=0&&parent[i]/N==l){int p=parent[i]%N;int pdx=x-p%W,pdy=y-p/W;if(pdx!=dxs[dir]||pdy!=dys[dir])cost+=3;}
   }else{
    if(topOnly)continue;
    bool existing=pth[k]==net;
    int viaExtra=int(ceil(.2/step));
    if(!existing&&(novias[k]||!available(x,y,0,net,viaExtra)||!available(x,y,1,net,viaExtra)))continue;
    nl=1-l;if(!available(x,y,nl,net,ex))continue;cost=existing?20:650;
   }
   int ni=idx(nx,ny,nl),ng=cur.g+cost;
   if(stamp[ni]!=epoch||ng<dista[ni]){stamp[ni]=epoch;dista[ni]=ng;parent[ni]=i;q.push({ng+heur(nx,ny,nl),ng,ni});}
  }
 }
 if(goal<0){cout<<"SEARCH FAILED visits="<<visits<<" source="<<a.x<<","<<a.y<<","<<a.l<<" target="<<b.x<<","<<b.y<<","<<b.l<<" pth="<<pth[a.y*W+a.x]<<","<<pth[b.y*W+b.x]<<"\n"<<flush;return {};}
 vector<int> path;for(int i=goal;i>=0;i=parent[i])path.push_back(i);reverse(path.begin(),path.end());return path;
}
int main(int argc,char**argv){
 if(argc<3)return 2;if(argc>3)searchBudget=stoi(argv[3]);ifstream in(argv[1]);ofstream out(argv[2]);in>>W>>H>>step>>ox>>oy;N=W*H;occ.assign(2*N,0);pth.assign(N,0);novias.assign(N,0);dista.resize(2*N);parent.resize(2*N);stamp.assign(2*N,0);
 // Copper centres must stay 0.6mm from the rounded perimeter.
 for(int y=0;y<H;y++)for(int x=0;x<W;x++){double px=ox+x*step,py=oy+y*step,ex=ox+(W-1)*step,ey=oy+(H-1)*step,cx=max(ox+5,min(ex-5,px)),cy=max(oy+5,min(ey-5,py));bool ok=px>=ox+.6&&px<=ex-.6&&py>=oy+.6&&py<=ey-.6&&hypot(px-cx,py-cy)<=4.4; if(!ok){occ[idx(x,y,0)]=occ[idx(x,y,1)]=65535;}}
 int np;in>>np;for(int j=0;j<np;j++){int layers,net,noVia,count;double margin;in>>layers>>net>>margin>>noVia>>count;vector<Pt>p(count);for(auto&v:p)in>>v.x>>v.y;polygon(p,layers,net,margin,noVia);}
 int nt;in>>nt;for(int k=0;k<nt;k++){int x,y,n;in>>x>>y>>n;if(x>=0&&x<W&&y>=0&&y<H)pth[y*W+x]=n;}
 int nn;in>>nn;vector<Net>nets(nn);for(auto&n:nets){int count;in>>n.id>>n.name>>n.width>>count;n.p.resize(count);for(auto&p:n.p)in>>p.x>>p.y>>p.l;}
 int failed=0,total=0;
 for(auto&n:nets){
  cout<<"NET "<<n.name<<" root="<<ox+n.p[0].x*step<<","<<oy+n.p[0].y*step<<" mask="<<occ[idx(n.p[0].x,n.p[0].y,0)]<<","<<occ[idx(n.p[0].x,n.p[0].y,1)]<<"\n"<<flush;
  if(n.p.size()<2)continue;vector<bool>done(n.p.size(),false);done[0]=true;int connected=1;
  while(connected<int(n.p.size())){
   vector<array<int,3>> options;for(int i=0;i<int(n.p.size());i++)if(done[i])for(int j=0;j<int(n.p.size());j++)if(!done[j])options.push_back({abs(n.p[i].x-n.p[j].x)+abs(n.p[i].y-n.p[j].y),i,j});sort(options.begin(),options.end());
   bool routed=false;int attempts=0;
   for(auto option:options){if(attempts++>=12)break;auto a=n.p[option[1]],b=n.p[option[2]];int budget=n.name=="/GND"?250000:searchBudget;vector<int>path=astar(a,b,n.id,n.width,n.name.find("SW_L")!=string::npos,budget);if(path.empty()&&n.width>.2)path=astar(a,b,n.id,.2,n.name.find("SW_L")!=string::npos,budget);double width=n.width;
    if(path.empty())continue;
    // Retrying wide nets at signal width is intentionally not accepted here.
    if(n.width>.2){bool wide=true;int extra=int(ceil((n.width/2-.1)/step-1e-6));for(int i:path){int k=i%N;if(!available(k%W,k/W,i/N,n.id,extra)){wide=false;break;}}if(!wide)width=.2;}
    vector<int>simple;simple.push_back(path[0]);for(int k=1;k<int(path.size())-1;k++){int p=path[k-1],c=path[k],v=path[k+1];if(c-p!=v-c||p/N!=c/N||c/N!=v/N)simple.push_back(c);}simple.push_back(path.back());
    for(int k=1;k<int(simple.size());k++){int ai=simple[k-1],bi=simple[k],al=ai/N,bl=bi/N,ap=ai%N,bp=bi%N,ax=ap%W,ay=ap/W,bx=bp%W,by=bp/W;
     if(al!=bl){if(pth[ap]!=n.id){out<<"V "<<n.id<<" "<<ox+ax*step<<" "<<oy+ay*step<<"\n";stroke(ax,ay,ax,ay,0,n.id,.635);stroke(ax,ay,ax,ay,1,n.id,.635);pth[ap]=n.id;for(int vy=max(0,ay-12);vy<=min(H-1,ay+12);vy++)for(int vx=max(0,ax-12);vx<=min(W-1,ax+12);vx++)if(hypot(vx-ax,vy-ay)*step<.6)novias[vy*W+vx]=1;}}
     else if(ai!=bi){out<<"S "<<n.id<<" "<<al<<" "<<width<<" "<<ox+ax*step<<" "<<oy+ay*step<<" "<<ox+bx*step<<" "<<oy+by*step<<"\n";stroke(ax,ay,bx,by,al,n.id,width/2+.335);}
    }
    done[option[2]]=true;connected++;routed=true;total++;cout<<n.name<<" "<<connected<<"/"<<n.p.size()<<"\n"<<flush;break;
   }
   if(!routed){for(int j=0;j<int(n.p.size());j++)if(!done[j]){auto p=n.p[j];out<<"FAIL "<<n.id<<" "<<n.name<<" "<<j<<"\n";cout<<"BLOCKED "<<n.name<<" "<<ox+p.x*step<<","<<oy+p.y*step<<" mask="<<occ[idx(p.x,p.y,0)]<<","<<occ[idx(p.x,p.y,1)]<<"\n"<<flush;failed++;}break;}
  }
 }
 cout<<"Completed "<<total<<" connections; failed "<<failed<<"\n";return 0;
}
