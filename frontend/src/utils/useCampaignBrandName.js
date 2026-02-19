const useCampaignBrandName = (campaign) => {
  return campaign?.brand_name || 'Vins & Conversations';
};

export default useCampaignBrandName;
