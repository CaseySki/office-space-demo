// API layer — calls Apps Script in production, uses mock data in demo mode

const API = (() => {
  const STORAGE_KEY = 'broker_admin_session';

  // --- Mock data for demo mode ---
  const mockBuildings = [
    { building_id: 'HBR', building_name: 'Harbor Point Tower', address: '200 N Harbor Dr', city: 'Milwaukee', state: 'WI', zip: '53202', description: 'Modern Class A office tower with panoramic lake views.', listing_type: 'lease', asking_price: '', broker: 'Sarah Mitchell' },
    { building_id: 'THD', building_name: 'The Third Ward Center', address: '401 E Erie St', city: 'Milwaukee', state: 'WI', zip: '53202', description: 'Creative office space in a converted warehouse.', listing_type: 'lease', asking_price: '', broker: '' },
    { building_id: 'WBP', building_name: 'Westbrook Business Park — Building A', address: '8500 W Capitol Dr', city: 'Wauwatosa', state: 'WI', zip: '53222', description: 'Suburban office park with ample free parking.', listing_type: 'lease', asking_price: '', broker: '' },
    { building_id: 'BRK', building_name: 'Brookfield Commerce Center', address: '17100 W Bluemound Rd', city: 'Brookfield', state: 'WI', zip: '53045', description: 'Professional office building near Brookfield Square.', listing_type: 'lease', asking_price: '', broker: 'James Kowalski' },
    { building_id: 'OKC', building_name: 'Oak Creek Industrial Flex', address: '9200 S Howell Ave', city: 'Oak Creek', state: 'WI', zip: '53154', description: 'Flex industrial space with office build-out.', listing_type: 'sale', asking_price: '1250000', broker: 'Sarah Mitchell, James Kowalski' },
  ];

  const mockSuites = [
    { suite_id: 'HBR-1200', building_id: 'HBR', suite_number: 'Suite 1200', floor: '12', square_feet: '4200', lease_rate: '24.50', rate_unit: '/SF/yr', status: 'Available', available_date: '2026-09-01', notes: 'Full-floor corner suite with lake views' },
    { suite_id: 'HBR-800', building_id: 'HBR', suite_number: 'Suite 800', floor: '8', square_feet: '2100', lease_rate: '22.00', rate_unit: '/SF/yr', status: 'Available', available_date: '', notes: 'Move-in ready, recently refreshed' },
    { suite_id: 'THD-201', building_id: 'THD', suite_number: 'Suite 201', floor: '2', square_feet: '1800', lease_rate: '19.00', rate_unit: '/SF/yr', status: 'Available', available_date: '', notes: 'Open floor plan with exposed brick' },
    { suite_id: 'WBP-A100', building_id: 'WBP', suite_number: 'Suite 100', floor: '1', square_feet: '1200', lease_rate: '14.00', rate_unit: '/SF/yr', status: 'Available', available_date: '', notes: 'Corner unit with two walls of windows' },
    { suite_id: 'BRK-310', building_id: 'BRK', suite_number: 'Suite 310', floor: '3', square_feet: '2800', lease_rate: '18.00', rate_unit: '/SF/yr', status: 'Available', available_date: '2026-10-01', notes: 'Views of Brookfield Hills' },
    { suite_id: 'OKC-100', building_id: 'OKC', suite_number: 'Unit 100', floor: '1', square_feet: '8000', lease_rate: '', rate_unit: '', status: 'Available', available_date: '', notes: 'Office/warehouse flex, 3 dock-high doors' },
  ];

  const mockContacts = [
    { name: 'Sarah Mitchell', title: 'Senior Commercial Broker', phone: '(414) 555-0142', email: 'sarah@example.com' },
    { name: 'James Kowalski', title: 'Commercial Broker Associate', phone: '(414) 555-0198', email: 'james@example.com' },
  ];

  let mockPending = [
    { id: 'demo-1', timestamp: '2026-06-28T14:30:00Z', changeType: 'edit', targetTab: 'Suites', targetId: 'HBR-1200', changeData: JSON.stringify({ lease_rate: '25.00', notes: 'Rate increased — strong demand' }), submittedBy: 'Sarah Mitchell', status: 'pending', reviewedBy: '', reviewedAt: '' },
    { id: 'demo-2', timestamp: '2026-06-28T10:15:00Z', changeType: 'add', targetTab: 'Buildings', targetId: 'NEW-1', changeData: JSON.stringify({ building_id: 'RVR', building_name: 'Riverfront Plaza', address: '500 N Water St', city: 'Milwaukee', state: 'WI', zip: '53202', description: 'New waterfront development with modern amenities.', listing_type: 'lease', asking_price: '', broker: 'Sarah Mitchell' }), submittedBy: 'Sarah Mitchell', status: 'pending', reviewedBy: '', reviewedAt: '' },
  ];

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch { return null; }
  }

  function setSession(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
  }

  async function callApi(action, params) {
    if (ADMIN_CONFIG.DEMO_MODE) {
      return callMock(action, params);
    }
    const url = new URL(ADMIN_CONFIG.API_URL);
    url.searchParams.set('action', action);
    for (const k in params) {
      url.searchParams.set(k, params[k]);
    }
    const resp = await fetch(url.toString());
    return resp.json();
  }

  function callMock(action, params) {
    return new Promise(resolve => {
      setTimeout(() => {
        switch (action) {
          case 'login':
            if (params.password === 'owner123') resolve({ success: true, role: 'owner' });
            else if (params.password === 'broker123') resolve({ success: true, role: 'broker' });
            else resolve({ success: false, error: 'Invalid password' });
            break;
          case 'getBuildings':
            resolve({ success: true, data: mockBuildings });
            break;
          case 'getSuites':
            resolve({ success: true, data: mockSuites });
            break;
          case 'getContacts':
            resolve({ success: true, data: mockContacts });
            break;
          case 'submitChange': {
            const entry = {
              id: 'demo-' + Date.now(),
              timestamp: new Date().toISOString(),
              changeType: params.changeType,
              targetTab: params.targetTab,
              targetId: params.targetId,
              changeData: params.changeData,
              submittedBy: params.submittedBy || 'Broker',
              status: 'pending',
              reviewedBy: '',
              reviewedAt: '',
            };
            mockPending.push(entry);
            resolve({ success: true, id: entry.id });
            break;
          }
          case 'getPending':
            if (params.role === 'broker') {
              resolve({ success: true, data: mockPending.filter(p => p.submittedBy === params.submittedBy) });
            } else {
              resolve({ success: true, data: mockPending });
            }
            break;
          case 'approveChange': {
            const item = mockPending.find(p => p.id === params.changeId);
            if (item) {
              item.status = 'approved';
              item.reviewedBy = 'Owner';
              item.reviewedAt = new Date().toISOString();
              resolve({ success: true });
            } else {
              resolve({ success: false, error: 'Not found' });
            }
            break;
          }
          case 'denyChange': {
            const d = mockPending.find(p => p.id === params.changeId);
            if (d) {
              d.status = 'denied';
              d.reviewedBy = 'Owner';
              d.reviewedAt = new Date().toISOString();
              resolve({ success: true });
            } else {
              resolve({ success: false, error: 'Not found' });
            }
            break;
          }
          default:
            resolve({ success: false, error: 'Unknown action' });
        }
      }, 300);
    });
  }

  return { callApi, getSession, setSession, clearSession };
})();
