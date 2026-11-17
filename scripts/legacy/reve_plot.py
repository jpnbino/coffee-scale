from pathlib import Path
s=Path(__file__).with_name('plot_enclosure_copper.py').read_text().replace('tmp/enclosure-routing/','tmp/reve-routing/')
s=s.replace("'/USB5':'#ed4040'","'/3V3':'#ed4040'")
s=s.replace("[('charge',104,79,114,88),('adc',140,75,149,85),('gpio',110,86,120,95)]","[('reve-reg',136,123,144,130)]")
exec(s)
