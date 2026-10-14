// Robots and STEM equipment share the Product model; the admin shows them as two separate sections.
const ROBOT_CATEGORIES = ['robot-leo-cau-thang', 'robot-di-theo-nguoi', 'robot-cat-co', 'robot-gia-dinh'];

const PRODUCT_SECTIONS = {
  robot: {
    key: 'robot',
    path: '/admin/robot',
    nav: 'robot',
    sortType: 'robots',
    categories: ROBOT_CATEGORIES,
    filter: { category: { $in: ROBOT_CATEGORIES } },
    titleKey: 'admin.products.robotsTitle',
    addKey: 'admin.products.addRobot',
    newKey: 'admin.products.formNewRobot',
    editKey: 'admin.products.formEditRobot',
  },
  equipment: {
    key: 'equipment',
    path: '/admin/thiet-bi',
    nav: 'thiet-bi',
    sortType: 'equipment',
    searchable: true, // shows the name search above the list
    categories: ['stem-equipment'],
    filter: { category: 'stem-equipment' },
    titleKey: 'admin.products.equipmentTitle',
    addKey: 'admin.products.addEquipment',
    newKey: 'admin.products.formNewEquipment',
    editKey: 'admin.products.formEditEquipment',
  },
};

function sectionForCategory(category) {
  return category === 'stem-equipment' ? PRODUCT_SECTIONS.equipment : PRODUCT_SECTIONS.robot;
}

module.exports = { ROBOT_CATEGORIES, PRODUCT_SECTIONS, sectionForCategory };
