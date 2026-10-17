import sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root))
from bacpypes3.local.analog import AnalogValueObject
from bacpypes3.local.binary import BinaryValueObject
from hmi.bacnet import BACnetDriver
server=BACnetDriver({'local_ip':'127.0.0.1','prefix':8,'port':47839,'device_id':1443213})
settings={'local_ip':'127.0.0.1','prefix':8,'port':47840,'device_id':3056177,'target':'127.0.0.1:47839','timeout':2,'discovery_timeout':.5}
driver=BACnetDriver(settings)
async def configure(client):
    client.this_application.app.add_object(AnalogValueObject(objectIdentifier=('analogValue',200),objectName='Room Temperature',presentValue=21.5,units='degreesCelsius',eventState='normal'))
    client.this_application.app.add_object(BinaryValueObject(objectIdentifier=('binaryValue',1),objectName='Fan',presentValue='inactive',eventState='normal'))
try:
    server._call(configure)
    print('Test:',driver.test())
    print('Objects:',driver.browse('1443213'))
    print('Properties:',driver.properties('1443213/2:200'))
    assert not any(p['property']=='units' and p['available'] for p in driver.properties('1443213/5:1')['items'])
    original_read=driver._read
    async def without_property_list(client,request,**kwargs):
        if request.endswith(' propertyList'):raise ValueError('unknown-property')
        return await original_read(client,request,**kwargs)
    driver._read=without_property_list;driver.property_cache.clear()
    fallback=driver.properties('1443213/2:200')
    assert any(p['property']=='presentValue' for p in fallback['items'])
    assert not fallback['warning'], fallback['warning']
    driver._read=original_read;driver.property_cache.clear()
    print('Batch:',driver.read_many(['1443213/2:200/presentValue','1443213/2:200/units','1443213/5:1/presentValue']))
    driver.write('1443213/2:200/presentValue',30.5)
    assert driver.read('1443213/2:200/presentValue')==30.5
    driver.write('1443213/2:200/outOfService',1)
    assert driver.read('1443213/2:200/outOfService')==1
    try:
        driver.write('1443213/2:200/999999',7)
        raise AssertionError('Unsupported property write unexpectedly succeeded')
    except ValueError as error:
        assert '999999' in str(error)
    driver.write('1443213/5:1/presentValue',1)
    assert driver.read('1443213/5:1/presentValue')==1
    driver.close()
    driver=BACnetDriver(settings)
    assert driver.test()['device_count']==1
    print('PASS: real BAC0 discovery, object/property browsing, RPM, binary write/read, close and reconnect')
finally:
    driver.close();server.close()
